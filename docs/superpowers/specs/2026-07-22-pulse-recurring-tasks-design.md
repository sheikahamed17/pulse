# Recurring Tasks — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review → implementation plan
**Feature:** Let a task repeat on an *after-completion* cadence — completing a recurring task spawns the next instance, one at a time.

## Problem

Tasks are one-off. The money domain has scheduled recurrence (`recurring_rules` + the `/api/cron/recur` sweep), but tasks want a different model: a chore/reminder that reappears *after you finish it* (e.g. "water plants every 3 days from when I last did"), one instance at a time, never piling up.

## Model (decided)

**After-completion, one-at-a-time.** A recurring task carries its own cadence. Completing it spawns the next instance due `completed_at + interval`. Indefinite until stopped (no end-after-N for v1). This is **client-driven** — the completion handler spawns the next task — so it needs **no cron** and **no new entity_kind** (unlike the schedule-based money model, which needs a cron precisely because it fires on a clock).

## Global Constraints

- Locked stack. No new dependencies. Reuse the existing `PeriodPicker` component and the pure `computeNextDue` in `src/lib/recurring.ts`.
- **No new entity_kind, no cron, no Dexie version bump.** Recurrence is two new *non-indexed* fields on the existing `task` entity (Dexie stores the whole object; only indexes are declared, so no `db.version()` bump). One D1 `ALTER TABLE`.
- Server materialize keeps `case 'task'` (no dispatch change) — the new fields flow through `TASK_FIELDS`.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Terse, code-first; match surrounding patterns.
- Gate before finishing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, run UN-CHAINED.

## Architecture

Recurrence lives as two fields on the task; a pure helper computes the next instance; the completion handler applies it.

1. **Schema — two fields on `task`:**
   - `recur_period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null` (null = not recurring — this is the "is recurring" flag).
   - `recur_interval: number | null` (positive int; the "every N").
   - Added to: `src/lib/op-schemas/task.ts` (`TaskPayloadSchema`, both nullable+optional), `src/lib/dexie.ts` `TaskRow`, `src/lib/entity-fields.ts` `TASK_FIELDS` (so LWW materialize + client `applyOp` carry them). D1: `ALTER TABLE tasks ADD COLUMN recur_period TEXT; ALTER TABLE tasks ADD COLUMN recur_interval INTEGER;` (applied remote via `wrangler d1 execute pulse --remote --command`).

2. **Pure spawn helper — `src/lib/recurring-task.ts`:**
   - `nextRecurringTaskPayload(task: { title: string; priority: 'low'|'medium'|'high'; recur_period: RecurPeriod; recur_interval: number }, completedAtIso: string): TaskPayload` — returns the next instance's create payload: `{ title, priority, due_at: computeNextDue({anchor_at: completedAtIso, next_due_at: completedAtIso, period: recur_period, interval_count: recur_interval, ...}), completed_at: null, source: 'recurring', recur_period, recur_interval, raw_input: null }`. Pure (delegates date math to `computeNextDue`), unit-testable.
   - `source` enum on `TaskPayloadSchema` must gain `'recurring'` (currently `'voice' | 'manual'`) → `'voice' | 'manual' | 'recurring'`.

3. **Create (client) — task confirmation chip:**
   - `ConfirmationChipTask` (`src/components/confirmation-chip.tsx`) gains a "Repeat" toggle + the existing `<PeriodPicker>` (mirrors `ConfirmationChipMoney`'s recurring UI). The chip's `onConfirm` carries `recur_period`/`recur_interval` (null when the toggle is off).
   - `confirmEntry` (`src/app/app/page.tsx`) task path writes `recur_period`/`recur_interval` into the task create op. First instance's `due_at` = the parsed `due_at` (or null → treat as due now for display).
   - `ChipDraft` task variant gains optional `recur_period?`/`recur_interval?`.

4. **Complete → spawn next (client):**
   - The task-complete handler (task list item / its container) currently emits a task `update` op `{ completed_at: nowIso }`. When the completed task has `recur_period != null`, ALSO:
     - Emit a NEW task `create` op with `nextRecurringTaskPayload(task, nowIso)` (new `entity_id`).
     - In the SAME completion `update` op on the finishing instance, set `recur_period: null, recur_interval: null` — the recurrence "moves forward" to the new instance, so re-completing (or un/re-complete) the finished one can never double-spawn.
   - All via `generateOp` + `applyLocalOp` + `pushPullOnce`. Works offline (ops sync later).

5. **Stop:** deleting the open recurring instance ends the series — delete never respawns; only *complete* does. (One-at-a-time means the sole open instance IS the series.)

6. **Indicator:** the task list item shows a 🔁 badge with the cadence (e.g. "🔁 every 3 days" / "🔁 daily") when `recur_period != null`, so it's clear the task repeats and that deleting stops it. A small pure `formatRecurrence(period, interval): string`.

## Data Flow

```
create "water plants, repeat every 3 days"
  → task op { title, priority, due_at, recur_period:'daily'? no → 'daily' w/ interval 3, recur_interval:3, source:'manual' }
  → appears in Tasks (open), 🔁 every 3 days

complete it (at T)
  → update op on instance: { completed_at:T, recur_period:null, recur_interval:null }   (recurrence consumed)
  → create op new instance: { title, priority, due_at: computeNextDue(anchor=T, daily, 3)=T+3d,
                              completed_at:null, source:'recurring', recur_period:'daily'?  (carry cadence), recur_interval:3 }
  → the finished one moves to Completed (no 🔁); the new one is open, 🔁 every 3 days

delete the open instance → series ends (nothing respawns)
```

## Error Handling

- If `computeNextDue` (or the spawn) throws, the completion `update` still applies (mark done); the spawn is attempted after and its failure is logged — the user isn't blocked from completing. (Spawn failure is effectively "stopped"; acceptable + rare.)
- A task with `recur_period` set but `recur_interval` null/≤0 is treated as non-recurring (defensive: the helper requires a positive interval).

## Testing

- `tests/lib/recurring-task.test.ts` (pure): `nextRecurringTaskPayload` computes the right `due_at` for daily/weekly/monthly/yearly + interval>1 (anchored to `completedAt`); carries title/priority/recur fields; sets `source:'recurring'`, `completed_at:null`. `formatRecurrence` strings ("daily", "every 3 days", "weekly", "every 2 weeks", …).
- `tests/recurring-task-complete.test.ts` (fake-indexeddb, via generateOp/applyLocalOp): complete a recurring task → exactly one new open instance exists with the next `due_at`, the finished instance is completed with `recur_period` cleared; **re-applying the completion (idempotency) does not create a second instance**; a completed *non*-recurring task spawns nothing; deleting an open recurring task leaves no respawn.
- Op-schema: `TaskPayloadSchema` accepts the new fields + `source:'recurring'`; rejects a non-positive `recur_interval`.
- Task-list rendering (🔁 badge) verified via the QA runbook (no component-render harness in-repo).

## Out of Scope (v1)

- End-after-N-count / end-until (indefinite only; stop by deleting).
- Skip-one-occurrence (complete advances, delete stops — no skip).
- Editing an existing task's recurrence (set at create; to change, delete + recreate).
- Schedule-based recurrence for tasks (that's the money model; deliberately not chosen).
- **Concurrent-completion dedup (documented limitation, not fixed in v1).** Because spawning is client-driven, completing the SAME instance on two devices before they sync produces two next instances (each with a random id — LWW can't merge them). The single-device path is correct; the concurrent case yields a deletable duplicate, not corruption. If it ever bites in practice, harden with a deterministic spawn id (LWW converges) or a server-side dedup on (user_id, title, due_at). Money avoids this only because its spawner is the server cron.
