# Overdue-Task Re-nudge (with per-task mute) — Design

**Date:** 2026-07-23
**Status:** Approved (design)
**Feature:** Re-notify daily about open, past-due tasks (they currently notify once at due time then go silent), riding the existing `*/15` due-task sweep, with a per-task "stop reminding" mute.

## Goal

`/api/cron/due-tasks` fires exactly one `due-{id}-{due_at}` push per task, then overdue tasks are never surfaced again. Add a **daily** re-nudge that continues until the task is completed, deleted, or explicitly muted — so an overdue task can't silently vanish, while a deliberately-deferred one can be silenced.

## Mechanism

The sweep's query already returns overdue tasks (they satisfy `due_at <= now AND completed_at IS NULL AND deleted_at IS NULL`). In the same loop, in addition to the once-ever due notification, emit a re-nudge:

- **Per-day dedup:** notification id `overdue-{taskId}-{localDay}` (local calendar day in the user's tz). The `push_notifications` primary key IS the dedup state, so 96 ticks/day produce at most one nudge/task/day — the same idempotency-by-id trick the due and budget alerts use. No per-task "last nudged" bookkeeping.
- **No day-0 double:** re-nudge only for tasks overdue since a *prior* local day (`dueDay < todayDay`), so the due-day's `due-` notification isn't doubled by an `overdue-` one.
- **Escalating body:** "Overdue 1 day" / "Overdue N days".
- **Stop conditions:** completing/deleting the task drops it from the query; muting sets `nudge_muted_at` and the re-nudge skips it. The initial `due-` notification is unaffected by mute (mute silences only the daily overdue nagging).

## New field — `tasks.nudge_muted_at: string | null`

Nullable timestamp (`null` = nudging active; set = muted), mirroring the `completed_at` / `deleted_at` idiom. Standard non-indexed task-field wiring (identical to how `parent_id` was added in migration 0012):

- Migration `0013_task_nudge_muted.sql`: `ALTER TABLE tasks ADD COLUMN nudge_muted_at TEXT;` (non-indexed → **no Dexie version bump**).
- `op-schemas/task.ts`: `nudge_muted_at: z.string().datetime().nullable().optional()`.
- `entity-fields.ts` `TASK_FIELDS`: add `'nudge_muted_at'` → `materializeRow_LWW` handles it generically (no per-column server code).
- `db.ts` Kysely `TaskTable`: `nudge_muted_at: string | null`.
- `dexie.ts` `TaskRow`: `nudge_muted_at?: string | null` — **OPTIONAL on purpose**, so the many inline `TaskRow` test fixtures (db-types, dexie, query-task-exec, task-org, entry-to-draft, edit/undo round-trips) that omit it still typecheck. (Durable gotcha: a *required* new TaskRow field breaks every fixture.)
- **No `sync-client.ts` applyLocalOp change** — a non-indexed field flows through the generic op-log field-merge (unlike a new entity_kind).

## Units

1. **`src/lib/overdue-nudge.ts` (pure, tested)**
   - `localDayKey(iso, tz): string` — "YYYY-MM-DD" in tz, via `Intl.DateTimeFormat('en-CA', …).formatToParts` (mirrors `yearMonthInTz` in `budget-exec.ts`, incl. UTC fallback for invalid tz).
   - `overdueNudge(task: { id; title; due_at: string | null; nudge_muted_at?: string | null }, nowIso, tz): { notifId; title; body } | null` — returns null if no due date, muted, or `dueDay >= todayDay`; else the descriptor with `overdue-{id}-{todayDay}` + "Overdue N day(s)" (N = whole-day diff via `Date.parse` of the two day-keys).

2. **`/api/cron/due-tasks/route.ts`** — change the task query to `selectAll()` (so reading `nudge_muted_at` is safe even if the column hasn't landed yet — an absent column reads as `undefined` = not muted = still nudges). In the loop, after the existing due-notification block, call `overdueNudge(task, now, tz)`; on a non-null descriptor, dedup-check + insert the `push_notifications` row and mark the user for push (reusing the existing `notifIds` set + send loop).

3. **`task-list.tsx`** — for an *overdue, open* task (`isOverdue`), a menu item toggling mute: not muted → "🔕 Stop reminding" (`BellOff`) emits an update op `{ nudge_muted_at: <now> }`; muted → "🔔 Resume reminding" (`Bell`) emits `{ nudge_muted_at: null }`. A small `BellOff` indicator on a muted row's due line. (Edit's field subset excludes `nudge_muted_at`, so editing preserves it.)

## Deploy ordering (must-do)

Migration `0013` **must** be applied to remote D1 around deploy. The cron *read* degrades gracefully (`selectAll` → absent column = not muted), but a client **mute op** materializes `nudge_muted_at` server-side (`materializeRow_LWW`), which fails if the column is absent. Apply via `wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN nudge_muted_at TEXT;"` (NOT `--file` — the `/import` endpoint 401s an OAuth login). If Cloudflare auth isn't available in-session, this is a hard owner prerequisite before mute is usable.

## Data flow

`*/15` tick → `scheduled()` shim → `/api/cron/due-tasks` → query (`selectAll`) → per task: due notif (once) + `overdueNudge` (daily) → dedup on `push_notifications.id` → insert + `sendPushToUser` (pull-on-push; SW fetches `/api/push/pending`). Mute: task menu → update op → `applyLocalOp` (client Dexie) + `materializeRow_LWW` (server) → cron skips muted.

## Error handling

- `overdueNudge` is pure/total; invalid tz falls back to UTC (via the `en-CA`/formatToParts fallback pattern).
- Cron per-user push wrapped in try/catch (existing).
- Pre-migration: read-side safe (graceful); write-side (mute) requires the column (see Deploy ordering).

## Testing

**Unit (`tests/lib/overdue-nudge.test.ts`):** `localDayKey` (a UTC-evening instant that rolls to the next day in Asia/Kolkata) + `overdueNudge` (no due date → null; due today → null; overdue-since-yesterday → `overdue-{id}-{today}` + "Overdue 1 day"; overdue 3 days → "Overdue 3 days"; muted → null). ~6 cases.

**Integration (`tests/task-nudge-mute-roundtrip.test.ts`):** a task `update` op setting `nudge_muted_at` materializes (via `applyLocalOp`), and clearing it (null) un-mutes — proving the field round-trips through LWW.

Cron wiring + the mute menu/indicator are QA-runbook-verified (`docs/superpowers/notes/2026-07-23-pulse-overdue-nudge-qa-runbook.md`), matching the other crons.

## Plan shape

~5 tasks: (1) migration 0013 + task-field wiring (op-schema/TASK_FIELDS/TaskRow/Kysely) + mute round-trip test; (2) pure `overdue-nudge.ts` + tests; (3) cron integration (selectAll + overdueNudge); (4) task-list mute/unmute menu + indicator; (5) QA runbook + gate. Opus whole-branch review (lenses: local-day/tz correctness + no day-0 double; dedup/idempotency; mute read+write path; regression to the existing due notification; fixture-safety of the new field).

## Constraints (verbatim)

- No new dependency (`Bell`/`BellOff` are in `lucide-react`). Locked stack.
- No new cron (cap is 5) — ride the existing `*/15` due-task sweep. No new entity_kind. No `sync-client.ts` change.
- Migration `0013` applied to remote via `wrangler d1 execute … --remote --command` (NOT `--file`).
- `TaskRow.nudge_muted_at` is OPTIONAL (avoid the TaskRow-fixture-breakage gotcha).
- Re-nudge is daily, per local day, only for tasks overdue since a prior local day; indefinite until done/deleted/muted.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck` / `lint` / `test` / `build`).
