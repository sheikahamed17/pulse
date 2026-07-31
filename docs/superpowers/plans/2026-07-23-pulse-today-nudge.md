# 'Today' Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A compact top-of-app strip that appears only when open tasks are due today or overdue, and jumps to the Tasks tab.

**Architecture:** A pure `task-attention.ts` (tz-aware counts + copy) + a `TodayNudge` component (renders null when clear) wired above the tabs in the app page.

**Tech Stack:** React 19, TypeScript, Dexie v9 (useLiveQuery), Tailwind 4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-pulse-today-nudge-design.md`

## Global Constraints

- No new dependency (`Clock` in `lucide-react`). No schema/sync/cron change. Dexie v9.
- Tasks-only; renders nothing when nothing is due-today/overdue. Exclude muted tasks (`nudge_muted_at`). tz via `prefs.tz` + `localDayKey`.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — separate; lint 0 errors).

## File Structure

- Create: `src/lib/task-attention.ts`, `tests/lib/task-attention.test.ts`, `src/components/today-nudge.tsx`, `docs/superpowers/notes/2026-07-23-pulse-today-nudge-qa-runbook.md`.
- Modify: `src/app/app/page.tsx` (render `<TodayNudge>` above the tabs).

---

### Task 1: Pure `task-attention.ts`

**Files:**
- Create: `src/lib/task-attention.ts`
- Test: `tests/lib/task-attention.test.ts`

**Interfaces:**
- Consumes: `localDayKey` from `@/lib/overdue-nudge`; `TaskRow` from `@/lib/dexie`.
- Produces: `type Attention = { dueToday: number; overdue: number }`; `taskAttention(tasks, nowIso, tz): Attention`; `attentionCopy(a): string | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/task-attention.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { taskAttention, attentionCopy } from '@/lib/task-attention'
import type { TaskRow } from '@/lib/dexie'

/* eslint-disable @typescript-eslint/no-explicit-any */
const t = (over: Partial<TaskRow>): TaskRow => ({ id: 'x', user_id: 'u', title: 't', due_at: null, priority: 'medium', completed_at: null, source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, nudge_muted_at: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over } as any)

const NOW = '2026-07-23T12:00:00.000Z' // UTC today = 2026-07-23

describe('taskAttention', () => {
  it('splits overdue vs due-today (UTC)', () => {
    const tasks = [
      t({ id: 'a', due_at: '2026-07-22T09:00:00.000Z' }), // yesterday → overdue
      t({ id: 'b', due_at: '2026-07-23T20:00:00.000Z' }), // today → dueToday
      t({ id: 'c', due_at: '2026-07-24T09:00:00.000Z' }), // tomorrow → neither
      t({ id: 'd', due_at: null }),                        // no due → neither
    ]
    expect(taskAttention(tasks, NOW, 'UTC')).toEqual({ dueToday: 1, overdue: 1 })
  })

  it('excludes completed / deleted / muted', () => {
    const tasks = [
      t({ id: 'a', due_at: '2026-07-22T09:00:00.000Z', completed_at: '2026-07-22T10:00:00.000Z' }),
      t({ id: 'b', due_at: '2026-07-22T09:00:00.000Z', deleted_at: '2026-07-22T10:00:00.000Z' }),
      t({ id: 'c', due_at: '2026-07-22T09:00:00.000Z', nudge_muted_at: '2026-07-23T00:00:00.000Z' }),
    ]
    expect(taskAttention(tasks, NOW, 'UTC')).toEqual({ dueToday: 0, overdue: 0 })
  })

  it('is tz-aware: a late-UTC due time is tomorrow in Asia/Kolkata', () => {
    // 2026-07-23T20:00Z = 2026-07-24 01:30 in Kolkata → tomorrow → neither
    const tasks = [t({ id: 'a', due_at: '2026-07-23T20:00:00.000Z' })]
    expect(taskAttention(tasks, NOW, 'Asia/Kolkata')).toEqual({ dueToday: 0, overdue: 0 })
  })
})

describe('attentionCopy', () => {
  it('both', () => { expect(attentionCopy({ dueToday: 2, overdue: 1 })).toBe('2 due today · 1 overdue') })
  it('only due today', () => { expect(attentionCopy({ dueToday: 2, overdue: 0 })).toBe('2 due today') })
  it('only overdue', () => { expect(attentionCopy({ dueToday: 0, overdue: 1 })).toBe('1 overdue') })
  it('none → null', () => { expect(attentionCopy({ dueToday: 0, overdue: 0 })).toBeNull() })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/lib/task-attention.test.ts`
Expected: FAIL — cannot resolve `@/lib/task-attention`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/task-attention.ts`:

```ts
import { localDayKey } from '@/lib/overdue-nudge'
import type { TaskRow } from '@/lib/dexie'

export type Attention = { dueToday: number; overdue: number }

export function taskAttention(tasks: TaskRow[], nowIso: string, tz: string): Attention {
  const today = localDayKey(nowIso, tz)
  let dueToday = 0
  let overdue = 0
  for (const t of tasks) {
    if (t.completed_at || t.deleted_at || t.nudge_muted_at || !t.due_at) continue
    const day = localDayKey(t.due_at, tz)
    if (day < today) overdue++
    else if (day === today) dueToday++
  }
  return { dueToday, overdue }
}

export function attentionCopy(a: Attention): string | null {
  const parts: string[] = []
  if (a.dueToday > 0) parts.push(`${a.dueToday} due today`)
  if (a.overdue > 0) parts.push(`${a.overdue} overdue`)
  return parts.length ? parts.join(' · ') : null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/lib/task-attention.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-attention.ts tests/lib/task-attention.test.ts
git commit -m "feat(today): pure taskAttention + attentionCopy"
```

---

### Task 2: `TodayNudge` component

**Files:**
- Create: `src/components/today-nudge.tsx`

**Interfaces:**
- Consumes: `useTasks`, `useUserPrefs`, `taskAttention`, `attentionCopy`.
- Produces: `TodayNudge({ userId, onGoToTasks }: { userId: string; onGoToTasks: () => void })` — renders the strip or `null`.

- [ ] **Step 1: Write the component**

Create `src/components/today-nudge.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { useTasks } from '@/hooks/use-tasks'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { taskAttention, attentionCopy } from '@/lib/task-attention'

export function TodayNudge({ userId, onGoToTasks }: { userId: string; onGoToTasks: () => void }) {
  const tasks = useTasks(userId, 'open')
  const { prefs } = useUserPrefs()
  const copy = useMemo(
    () => attentionCopy(taskAttention(tasks, new Date().toISOString(), prefs.tz)),
    [tasks, prefs.tz],
  )
  if (!copy) return null
  return (
    <button
      type="button"
      onClick={onGoToTasks}
      aria-label={`${copy} — go to Tasks`}
      className="glass flex w-full items-center gap-2 rounded-2xl px-4 py-3 min-h-[44px] text-sm hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
    >
      <Clock className="h-4 w-4 flex-shrink-0 text-warning" />
      <span className="flex-1 text-left font-medium">{copy}</span>
      <span className="flex-shrink-0 text-xs text-muted-foreground">Tasks →</span>
    </button>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/today-nudge.tsx
git commit -m "feat(today): TodayNudge strip (renders null when caught up)"
```

---

### Task 3: Wire into the app page + QA runbook

**Files:**
- Modify: `src/app/app/page.tsx`
- Create: `docs/superpowers/notes/2026-07-23-pulse-today-nudge-qa-runbook.md`

- [ ] **Step 1: Import + render**

In `src/app/app/page.tsx`, add the import (near the other component imports, e.g. after the `GlobalSearch` import):

```ts
import { TodayNudge } from '@/components/today-nudge'
```

Render it just before the desktop tab-bar block. Find:

```tsx
          {/* Desktop tab bar — appears in document flow above the tab content */}
          <div className="hidden md:block">
            <TabBar active={activeTab} onChange={setTab} taskBadgeCount={taskBadgeCount} />
          </div>
```

and insert directly above it:

```tsx
          <TodayNudge userId={user.id} onGoToTasks={() => setTab('tasks')} />

          {/* Desktop tab bar — appears in document flow above the tab content */}
          <div className="hidden md:block">
            <TabBar active={activeTab} onChange={setTab} taskBadgeCount={taskBadgeCount} />
          </div>
```

- [ ] **Step 2: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-23-pulse-today-nudge-qa-runbook.md`:

```markdown
# 'Today' Nudge — QA Runbook (on-device)

1. With NO open task due today or overdue → nothing shows at the top (strip hidden).
2. Create a task due today → a strip appears at the top: "⏰ 1 due today  Tasks →" (on every tab).
3. Create a task with a past due date → the strip updates: "… · N overdue".
4. Tap the strip → the app switches to the Tasks tab.
5. Complete or delete the task → the count drops; when nothing is left due-today/overdue, the strip disappears.
6. Mute an overdue task ("🔕 Stop reminding") → it stops counting in the strip (mute is honored here too).
7. Copy shapes: only-due → "N due today"; only-overdue → "N overdue"; both → "N due today · M overdue".
```

- [ ] **Step 3: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors; tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/page.tsx docs/superpowers/notes/2026-07-23-pulse-today-nudge-qa-runbook.md
git commit -m "feat(today): wire TodayNudge above the tabs + QA runbook"
```

---

## Post-implementation

- Opus whole-branch review (lenses: attention/tz correctness + mute exclusion; render-null-when-clear; copy shapes; no regression to the page/tabs).
- Merge to `main` (auto-deploys); no D1 migration. Verify CI + Deploy both `success` + prod HTTP 200.
- Owner follow-up: run the QA runbook on-device (esp. the strip appearing/disappearing + mute exclusion).
