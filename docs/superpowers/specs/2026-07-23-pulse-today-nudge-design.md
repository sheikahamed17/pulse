# 'Today' Nudge — Design

**Date:** 2026-07-23
**Status:** Approved (design)
**Feature:** A compact top-of-app strip that appears only when open tasks are due today or overdue, and jumps to the Tasks tab.

## Goal

Surface "what needs me right now" without a dedicated screen or persistent clutter: when there are open tasks due today or overdue, show a small tappable strip at the top; when the user is caught up, show nothing.

## Non-goals

- No money / notes / learning in the glance (the chosen "actionable nudge" shape is tasks-only). No dedicated tab or view. No new dependency, no schema/sync change.
- Not a push notification (that's the separate overdue re-nudge feature); this is a passive in-app strip.

## Behavior

- Renders **only** when `dueToday > 0 || overdue > 0` over the user's open tasks; otherwise renders nothing (`null`).
- **Muted tasks are excluded** (`nudge_muted_at` set) — the mute feature means "stop reminding me," honored here too.
- tz-aware: uses the user's `prefs.tz` via the existing `localDayKey` (from `overdue-nudge.ts`), consistent with the push re-nudge's day logic (`dueDay < today` → overdue; `dueDay === today` → due today).
- Tapping the strip → Tasks tab (`setTab('tasks')`).

## Architecture

**Unit 1 — `src/lib/task-attention.ts` (pure, tested).**

```ts
import { localDayKey } from '@/lib/overdue-nudge'
import type { TaskRow } from '@/lib/dexie'

export type Attention = { dueToday: number; overdue: number }

export function taskAttention(tasks: TaskRow[], nowIso: string, tz: string): Attention
export function attentionCopy(a: Attention): string | null
```

- `taskAttention`: over `tasks`, skip any with `completed_at`, `deleted_at`, `nudge_muted_at`, or no `due_at`; compute `localDayKey(due_at, tz)` vs `localDayKey(nowIso, tz)`; `<` → `overdue++`, `===` → `dueToday++`. (Future due dates are ignored — the glance is about now.)
- `attentionCopy`: `null` when `dueToday === 0 && overdue === 0`; else join the non-zero parts — `"{n} due today"` and/or `"{n} overdue"` with `" · "`. (No pluralization needed; the noun phrase reads for any count.)

**Unit 2 — `src/components/today-nudge.tsx`.** Mounts `useTasks(userId, 'open')` + `useUserPrefs()`, memoizes `taskAttention(tasks, new Date().toISOString(), prefs.tz)` → `attentionCopy`. Returns `null` when copy is null; else a tappable glass strip: a `Clock`/`AlarmClock` (lucide) icon + the copy + a "Tasks →" affordance, `onClick={onGoToTasks}`. Full-width, min 44px, focus ring.

**Unit 3 — app-page wiring.** Render `<TodayNudge userId={user.id} onGoToTasks={() => setTab('tasks')} />` just above the desktop tab-bar block (so it sits above the tab content on every tab, mobile + desktop).

## Data flow

`useTasks('open')` + `prefs.tz` → `taskAttention` → `attentionCopy` → render-or-null. Tap → `setTab('tasks')`. Pure client read; **no schema / sync / agent / cron / dependency change**; Dexie v9.

## Error handling

Both pure fns are total. The strip only renders with real pending work; the tap only switches tabs. A user with no due-dated open tasks (or all muted) sees nothing.

## Testing

**Unit (`tests/lib/task-attention.test.ts`):**
- `taskAttention`: due-today vs overdue split; tz boundary (a UTC-evening `due_at` that is *tomorrow* in Asia/Kolkata counts as neither overdue nor due-today for a "today" now); excludes completed / deleted / **muted** / no-due; future due date ignored.
- `attentionCopy`: both → "2 due today · 1 overdue"; only due → "2 due today"; only overdue → "1 overdue"; none → `null`.
~7 cases.

The strip render/null + tap-to-Tasks are QA-runbook-verified (`docs/superpowers/notes/2026-07-23-pulse-today-nudge-qa-runbook.md`).

## Plan shape

~3 tasks: (1) pure `task-attention.ts` + tests; (2) `TodayNudge` component; (3) page wiring + QA runbook + gate. Opus whole-branch review (lenses: attention/tz correctness + mute exclusion; render-null-when-clear; no regression to the page/tabs).

## Constraints (verbatim)

- No new dependency (`Clock`/`AlarmClock` in `lucide-react`). No schema/sync/cron change. Dexie v9.
- Tasks-only; renders nothing when nothing is due-today/overdue.
- Exclude muted tasks (`nudge_muted_at`). tz via `prefs.tz` + `localDayKey`.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck` / `lint` / `test` / `build`).
