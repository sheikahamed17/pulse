# Overdue-Task Re-nudge (with mute) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily re-notification about open, past-due tasks (riding the existing `*/15` due-task sweep, no new cron), with a per-task "stop reminding" mute.

**Architecture:** A new nullable `tasks.nudge_muted_at` timestamp (standard non-indexed task-field wiring) + a pure `overdue-nudge.ts` (local-day/tz math + a per-day notification descriptor) integrated into `/api/cron/due-tasks` + a mute/unmute menu action in `task-list`.

**Tech Stack:** Next 16 route handlers on Cloudflare Workers, Kysely/D1, Dexie v9, op-log/HLC-LWW, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-23-pulse-overdue-nudge-design.md`

## Global Constraints

- No new dependency (`Bell`/`BellOff` in `lucide-react`). No new cron (cap 5) — ride the existing `*/15` sweep. No new entity_kind. No `sync-client.ts` change.
- `TaskRow.nudge_muted_at` is **OPTIONAL** (`nudge_muted_at?: string | null`) to avoid breaking the inline TaskRow test fixtures.
- Re-nudge daily, per local calendar day (user tz), only for tasks overdue since a *prior* local day (`dueDay < todayDay`); indefinite until done / deleted / muted. Mute silences only the daily overdue nudge, not the initial `due-` notification.
- Notification dedup id: `overdue-{taskId}-{localDay}` (matches the `due-`/budget idempotency-by-id pattern).
- Migration `0013` applied to remote via `wrangler d1 execute pulse --remote --command "…"` (NOT `--file`).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — separate; lint 0 errors).

## File Structure

- Create: `migrations/0013_task_nudge_muted.sql`, `src/lib/overdue-nudge.ts`, `tests/lib/overdue-nudge.test.ts`, `tests/task-nudge-mute-roundtrip.test.ts`, `docs/superpowers/notes/2026-07-23-pulse-overdue-nudge-qa-runbook.md`.
- Modify: `src/lib/op-schemas/task.ts`, `src/lib/entity-fields.ts`, `src/lib/dexie.ts`, `src/lib/db.ts` (field wiring); `src/app/api/cron/due-tasks/route.ts` (integrate re-nudge); `src/components/task-list.tsx` (mute menu + indicator).

---

### Task 1: `nudge_muted_at` field wiring + mute round-trip test

**Files:**
- Create: `migrations/0013_task_nudge_muted.sql`, `tests/task-nudge-mute-roundtrip.test.ts`
- Modify: `src/lib/op-schemas/task.ts`, `src/lib/entity-fields.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`

**Interfaces:**
- Produces: `tasks.nudge_muted_at` as a synced task field. `TaskRow.nudge_muted_at?: string | null`; `TaskTable.nudge_muted_at: string | null`.

- [ ] **Step 1: Write the failing round-trip test**

Create `tests/task-nudge-mute-roundtrip.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('task nudge_muted_at round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('mutes then un-mutes via update ops', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'create',
      payload: { title: 'Pay rent', priority: 'high', completed_at: null, source: 'manual', tags: [], project_id: null },
      user_id: U,
    }))
    expect((await db.tasks.get('t1'))?.nudge_muted_at ?? null).toBeNull()

    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'update',
      payload: { nudge_muted_at: '2026-07-23T10:00:00.000Z' },
      user_id: U,
    }))
    expect((await db.tasks.get('t1'))?.nudge_muted_at).toBe('2026-07-23T10:00:00.000Z')

    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'update',
      payload: { nudge_muted_at: null },
      user_id: U,
    }))
    expect((await db.tasks.get('t1'))?.nudge_muted_at ?? null).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test — note it may already pass**

Run: `pnpm test tests/task-nudge-mute-roundtrip.test.ts`
Expected: likely PASS even now — the **client** materialize (`applyLocalOp` → op-log `applyOp`) iterates payload fields generically, so `nudge_muted_at` round-trips through Dexie without any wiring. This test is therefore a **regression guard**, not a strict fail-first. The wiring in Steps 3–6 is what the rest of the system needs: the op-schema (so a typed payload accepts the field), `TASK_FIELDS` (so the **server** `materializeRow_LWW` writes it to D1), the Kysely/TaskRow types (typecheck), and the migration (the D1 column). `pnpm typecheck` is the check that genuinely fails before Step 5 and passes after.

- [ ] **Step 3: Add the field to the op-schema**

In `src/lib/op-schemas/task.ts`, add inside `TaskPayloadSchema` (after `parent_id`):
```ts
  nudge_muted_at: z.string().datetime().nullable().optional(),
```

- [ ] **Step 4: Add to `TASK_FIELDS`**

In `src/lib/entity-fields.ts`, extend `TASK_FIELDS`:
```ts
export const TASK_FIELDS = [
  'title', 'due_at', 'priority', 'completed_at',
  'source', 'raw_input', 'recur_period', 'recur_interval',
  'tags', 'project_id', 'parent_id', 'nudge_muted_at',
] as const
```

- [ ] **Step 5: Add to the Dexie `TaskRow` and Kysely `TaskTable`**

In `src/lib/dexie.ts`, in `TaskRow`, add after `parent_id: string | null`:
```ts
  nudge_muted_at?: string | null
```

In `src/lib/db.ts`, in `interface TaskTable`, add after `parent_id: string | null`:
```ts
  nudge_muted_at: string | null
```

- [ ] **Step 6: Create the migration**

Create `migrations/0013_task_nudge_muted.sql`:
```sql
-- Per-task mute for the daily overdue re-nudge. NULL = nudging active.
ALTER TABLE tasks ADD COLUMN nudge_muted_at TEXT;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test tests/task-nudge-mute-roundtrip.test.ts`
Expected: PASS (1 test). Then `pnpm typecheck` → clean.

- [ ] **Step 8: Commit**

```bash
git add migrations/0013_task_nudge_muted.sql src/lib/op-schemas/task.ts src/lib/entity-fields.ts src/lib/dexie.ts src/lib/db.ts tests/task-nudge-mute-roundtrip.test.ts
git commit -m "feat(nudge): add tasks.nudge_muted_at field (migration 0013 + wiring)"
```

---

### Task 2: Pure `overdue-nudge.ts`

**Files:**
- Create: `src/lib/overdue-nudge.ts`
- Test: `tests/lib/overdue-nudge.test.ts`

**Interfaces:**
- Produces:
  - `localDayKey(iso: string, tz: string): string` — "YYYY-MM-DD" in tz.
  - `overdueNudge(task: { id: string; title: string; due_at: string | null; nudge_muted_at?: string | null }, nowIso: string, tz: string): { notifId: string; title: string; body: string } | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/overdue-nudge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { localDayKey, overdueNudge } from '@/lib/overdue-nudge'

describe('localDayKey', () => {
  it('rolls a UTC-evening instant into the next day in Asia/Kolkata (+5:30)', () => {
    expect(localDayKey('2026-07-23T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-07-24')
  })
  it('keeps the same day in UTC', () => {
    expect(localDayKey('2026-07-23T12:00:00.000Z', 'UTC')).toBe('2026-07-23')
  })
})

describe('overdueNudge', () => {
  const now = '2026-07-23T12:00:00.000Z' // today (UTC) = 2026-07-23

  it('returns null when the task has no due date', () => {
    expect(overdueNudge({ id: 't', title: 'x', due_at: null }, now, 'UTC')).toBeNull()
  })
  it('returns null when due today (no day-0 double with the due notification)', () => {
    expect(overdueNudge({ id: 't', title: 'x', due_at: '2026-07-23T01:00:00.000Z' }, now, 'UTC')).toBeNull()
  })
  it('nudges when overdue since yesterday', () => {
    const n = overdueNudge({ id: 't1', title: 'Pay rent', due_at: '2026-07-22T09:00:00.000Z' }, now, 'UTC')
    expect(n).toEqual({ notifId: 'overdue-t1-2026-07-23', title: 'Task overdue: Pay rent', body: 'Overdue 1 day' })
  })
  it('pluralizes days overdue', () => {
    const n = overdueNudge({ id: 't2', title: 'Call', due_at: '2026-07-20T09:00:00.000Z' }, now, 'UTC')
    expect(n?.body).toBe('Overdue 3 days')
  })
  it('returns null when muted', () => {
    expect(overdueNudge({ id: 't', title: 'x', due_at: '2026-07-20T09:00:00.000Z', nudge_muted_at: '2026-07-23T00:00:00.000Z' }, now, 'UTC')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/lib/overdue-nudge.test.ts`
Expected: FAIL — cannot resolve `@/lib/overdue-nudge`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/overdue-nudge.ts`:

```ts
/** "YYYY-MM-DD" of an ISO instant as seen in the given IANA tz (UTC fallback for an invalid tz). */
export function localDayKey(iso: string, tz: string): string {
  const fmt = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = fmt().formatToParts(new Date(iso))
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  }
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

type OverdueTask = { id: string; title: string; due_at: string | null; nudge_muted_at?: string | null }

/**
 * The daily overdue re-nudge descriptor for a task, or null when it should not fire:
 * no due date, muted, or not overdue since a PRIOR local day (avoids doubling the
 * due-day's `due-` notification). notifId is per local day → at most one nudge/day.
 */
export function overdueNudge(task: OverdueTask, nowIso: string, tz: string): { notifId: string; title: string; body: string } | null {
  if (!task.due_at) return null
  if (task.nudge_muted_at) return null
  const today = localDayKey(nowIso, tz)
  const dueDay = localDayKey(task.due_at, tz)
  if (dueDay >= today) return null // string compare works for YYYY-MM-DD; not overdue since a prior day
  const days = Math.round((Date.parse(today) - Date.parse(dueDay)) / 86_400_000)
  return {
    notifId: `overdue-${task.id}-${today}`,
    title: `Task overdue: ${task.title.slice(0, 60)}`,
    body: days === 1 ? 'Overdue 1 day' : `Overdue ${days} days`,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/lib/overdue-nudge.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/overdue-nudge.ts tests/lib/overdue-nudge.test.ts
git commit -m "feat(nudge): pure overdue-nudge (localDayKey + overdueNudge)"
```

---

### Task 3: Integrate the re-nudge into the due-task cron

**Files:**
- Modify: `src/app/api/cron/due-tasks/route.ts`

**Interfaces:**
- Consumes: `overdueNudge` from `@/lib/overdue-nudge`.

- [ ] **Step 1: Add the import**

In `src/app/api/cron/due-tasks/route.ts`, add:
```ts
import { overdueNudge } from '@/lib/overdue-nudge'
```

- [ ] **Step 2: Read all task columns (so `nudge_muted_at` is available, degrading gracefully pre-migration)**

Change the `dueTasks` query's `.select([...])` to `.selectAll()`:
```ts
  const dueTasks = await db
    .selectFrom('tasks')
    .where('due_at', '<=', now)
    .where('completed_at', 'is', null)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()
```

- [ ] **Step 3: Emit the daily overdue re-nudge inside the existing loop**

In the `for (const task of dueTasks)` loop, AFTER the existing due-notification block (right before the closing `}` of the loop, after `notifiedTaskCount++` / the due insert), add:

```ts
    // Daily overdue re-nudge (rides this same sweep; per-day dedup id).
    const nudge = overdueNudge(task, now, userTz)
    if (nudge) {
      const nExists = await db
        .selectFrom('push_notifications')
        .where('id', '=', nudge.notifId)
        .select('id')
        .executeTakeFirst()
      if (!nExists) {
        await db
          .insertInto('push_notifications')
          .values({
            id: nudge.notifId,
            user_id: task.user_id,
            title: nudge.title,
            body: nudge.body,
            url: '/app?tab=tasks',
            created_at: now,
            read_at: null,
          })
          .execute()
        notifIds.add(task.user_id)
        notifiedTaskCount++
      }
    }
```

Note: `userTz` is already computed earlier in the loop for the due-notification body; reuse it. This block runs for every task in `dueTasks` regardless of whether the due-notification block `continue`d — so move the due-notification `if (exists) continue` logic so it does NOT skip the overdue block. Concretely, restructure the due block to not `continue` past the overdue block: wrap the due-notification insert in `if (!exists) { … }` instead of `if (exists) continue`. Full loop body:

```ts
  for (const task of dueTasks) {
    const dueAtStr = task.due_at ?? ''
    const userTz = userPrefsMap.get(task.user_id)?.tz ?? 'Asia/Kolkata'

    // Once-ever due notification.
    const notifId = `due-${task.id}-${dueAtStr}`
    const exists = await db
      .selectFrom('push_notifications')
      .where('id', '=', notifId)
      .select('id')
      .executeTakeFirst()
    if (!exists) {
      const dueTime = formatLocalDateTime(dueAtStr, userTz)
      await db
        .insertInto('push_notifications')
        .values({
          id: notifId,
          user_id: task.user_id,
          title: `Task due: ${task.title.slice(0, 60)}`,
          body: dueTime,
          url: '/app?tab=tasks',
          created_at: now,
          read_at: null,
        })
        .execute()
      notifIds.add(task.user_id)
      notifiedTaskCount++
    }

    // Daily overdue re-nudge (rides this same sweep; per-day dedup id).
    const nudge = overdueNudge(task, now, userTz)
    if (nudge) {
      const nExists = await db
        .selectFrom('push_notifications')
        .where('id', '=', nudge.notifId)
        .select('id')
        .executeTakeFirst()
      if (!nExists) {
        await db
          .insertInto('push_notifications')
          .values({
            id: nudge.notifId,
            user_id: task.user_id,
            title: nudge.title,
            body: nudge.body,
            url: '/app?tab=tasks',
            created_at: now,
            read_at: null,
          })
          .execute()
        notifIds.add(task.user_id)
        notifiedTaskCount++
      }
    }
  }
```

(Replace the existing loop body — from `const dueAtStr = …` through the due insert — with the above. The `userTz`/`dueTime` computation moves inside the `if (!exists)` where used. Delete the old standalone `const userTz = …` / `const dueTime = …` / `const title`/`const body` lines that are now folded in.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` (clean) and `pnpm build` (compiles the route). The cron behavior is QA-verified (D1-backed route; not unit-tested here — the pure `overdueNudge` in Task 2 covers the logic).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/due-tasks/route.ts
git commit -m "feat(nudge): daily overdue re-nudge in the due-task sweep"
```

---

### Task 4: task-list mute/unmute menu + indicator

**Files:**
- Modify: `src/components/task-list.tsx`

**Interfaces:**
- Consumes: `t.nudge_muted_at` (TaskRow), `generateOp`/`applyLocalOp`/`pushPullOnce` (already imported).

- [ ] **Step 1: Add the icons + a toggleMute handler**

In `src/components/task-list.tsx`, add `Bell` and `BellOff` to the lucide import:
```ts
import { Circle, CheckCircle2, Trash2, Repeat, Plus, Pencil, Bell, BellOff } from 'lucide-react'
```

Add a handler next to `deleteTask`:
```tsx
  async function toggleMute(t: TaskRow) {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: t.id, op_type: 'update',
      payload: { nudge_muted_at: t.nudge_muted_at ? null : new Date().toISOString() },
      user_id: userId,
    }))
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }
```

- [ ] **Step 2: Add the mute menu item (overdue open tasks only)**

In `renderRow`'s menu block, between the Edit item and the Delete button, add:
```tsx
            {isOverdue && (
              <button
                type="button"
                aria-label={t.nudge_muted_at ? `Resume reminders for: ${t.title.slice(0, 30)}` : `Stop reminders for: ${t.title.slice(0, 30)}`}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => { toggleMute(t); setMenuFor(null) }}
              >
                {t.nudge_muted_at ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                {t.nudge_muted_at ? 'Resume reminding' : 'Stop reminding'}
              </button>
            )}
```

- [ ] **Step 3: Add a muted indicator on the row's due line**

In `renderRow`, in the `<span>` that renders the due date, append after the due-date span (inside the same metadata `<span className="text-xs text-muted-foreground">`), add:
```tsx
                {isOverdue && t.nudge_muted_at && (
                  <span className="ml-1 inline-flex items-center text-muted-foreground" aria-label="Reminders muted">
                    <BellOff className="h-3 w-3" />
                  </span>
                )}
```
Place it immediately after the `{t.due_at && ( … )}` block, still inside the metadata span.

- [ ] **Step 4: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors; tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/task-list.tsx
git commit -m "feat(nudge): mute/resume reminders menu action + muted row indicator"
```

---

### Task 5: QA runbook

**Files:**
- Create: `docs/superpowers/notes/2026-07-23-pulse-overdue-nudge-qa-runbook.md`

- [ ] **Step 1: Create the runbook**

Create `docs/superpowers/notes/2026-07-23-pulse-overdue-nudge-qa-runbook.md`:

```markdown
# Overdue-Task Re-nudge — QA Runbook (on-device)

Requires notifications enabled + migration 0013 applied to remote D1.

**Re-nudge (needs a task overdue since a prior day + the */15 cron to tick):**
1. Create a task with a due date in the past (yesterday or earlier), leave it open.
2. Within ~15 min a push arrives: "Task overdue: <title>" / "Overdue N days". Tapping opens /app?tab=tasks.
3. It does NOT re-fire again the same day (per-day dedup); the next nudge is the following day.
4. A task due LATER TODAY gets only the "Task due:" notification today — no overdue nudge until tomorrow.

**Mute:**
5. Long-press an overdue task → menu shows "🔕 Stop reminding" → tap → the row shows a 🔕 indicator; no more overdue pushes for it.
6. Long-press it again → "🔔 Resume reminding" → nudges resume the next day.
7. Completing or deleting an overdue task stops its nudges (and Undo of a delete restores it — nudges resume).

**Regressions:**
8. The initial "Task due:" notification still fires once at due time (mute does not suppress it).
9. Budget alerts + weekly digest pushes still work (shared push path unaffected).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-07-23-pulse-overdue-nudge-qa-runbook.md
git commit -m "docs(nudge): overdue re-nudge QA runbook"
```

---

## Post-implementation

- Opus whole-branch review (lenses: local-day/tz correctness + no day-0 double; per-day dedup/idempotency; mute read (cron) + write (materialize) path; regression to the once-ever due notification and the shared push send; `nudge_muted_at` field-wiring + fixture-safety).
- **Apply migration 0013 to remote D1:** `wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN nudge_muted_at TEXT;"` (NOT `--file`). MUST land around deploy — the cron read degrades gracefully without it, but a client mute op's server materialize needs the column. If Cloudflare auth is unavailable in-session, flag as a hard owner prerequisite.
- Merge to `main` (auto-deploys). Verify CI + Deploy both `success` + prod HTTP 200.
- Owner follow-up: run the QA runbook on-device (esp. the re-nudge timing + mute toggle) once 0013 is applied remotely.
