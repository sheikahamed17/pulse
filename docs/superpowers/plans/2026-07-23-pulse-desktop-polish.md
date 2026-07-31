# Desktop Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conservative desktop refinements — a Notes summary card, a wider container, roomier `md:` spacing, and one bounded list type bump.

**Architecture:** Presentational only. A new `NotesSummary` (sibling of `LearningSummary`) fills the empty aside on the Notes tab; the rest are `md:` class tweaks on the outer container + the four list primary-text elements.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Dexie v9 (useLiveQuery).

**Spec:** `docs/superpowers/specs/2026-07-23-pulse-desktop-polish-design.md`

## Global Constraints

- Presentational only; no logic/schema/sync/dependency change. Dexie v9. No new unit tests.
- Mobile layout untouched — every spacing/type change is a `md:` modifier.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — separate; lint 0 errors; existing suite stays green).

## File Structure

- Create: `src/components/notes-summary.tsx`, `docs/superpowers/notes/2026-07-23-pulse-desktop-polish-qa-runbook.md`.
- Modify: `src/app/app/page.tsx` (container/left-col classes + aside NotesSummary + import); `src/components/{money,task,learning,notes}-list.tsx` (one primary-text element each).

---

### Task 1: `NotesSummary` + wire into the aside

**Files:**
- Create: `src/components/notes-summary.tsx`
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Create `NotesSummary` (mirror of `LearningSummary`)**

Create `src/components/notes-summary.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { useNotes } from '@/hooks/use-notes'

type Props = { userId: string }

export function NotesSummary({ userId }: Props) {
  const notes = useNotes(userId)

  const { thisWeek, topTags } = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let thisWeek = 0
    const tagCounts = new Map<string, number>()

    for (const e of notes) {
      const entryDate = new Date(e.occurred_at)
      if (entryDate >= weekAgo) thisWeek++
      for (const tag of e.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag)

    return { thisWeek, topTags }
  }, [notes])

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <header>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Notes</span>
      </header>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-center justify-between">
          <span>This week</span>
          <span className="font-mono tabular-nums">{thisWeek}</span>
        </li>
        <li className="flex items-center justify-between">
          <span>Total</span>
          <span className="font-mono tabular-nums">{notes.length}</span>
        </li>
      </ul>
      {topTags.length > 0 && (
        <>
          <div className="border-t border-white/10 pt-2" />
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">Top tags</span>
            <div className="flex flex-wrap gap-1">
              {topTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-muted-foreground border border-white/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Import + render in the aside**

In `src/app/app/page.tsx`, add the import near the other summary imports (e.g. after the `LearningSummary` import):
```ts
import { NotesSummary } from '@/components/notes-summary'
```

In the desktop `<aside>` block, add the notes case alongside the others:
```tsx
        <aside className="hidden md:block">
          <div className="sticky top-6 flex flex-col gap-4">
            {activeTab === 'money' && <MoneyCard userId={user.id} />}
            {activeTab === 'tasks' && <TaskSummary userId={user.id} />}
            {activeTab === 'learning' && <LearningSummary userId={user.id} />}
            {activeTab === 'notes' && <NotesSummary userId={user.id} />}
          </div>
        </aside>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/notes-summary.tsx src/app/app/page.tsx
git commit -m "feat(desktop): NotesSummary card fills the empty Notes-tab sidebar"
```

---

### Task 2: Container width + `md:` spacing + list type bump + QA runbook

**Files:**
- Modify: `src/app/app/page.tsx`, `src/components/money-list.tsx`, `src/components/task-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx`
- Create: `docs/superpowers/notes/2026-07-23-pulse-desktop-polish-qa-runbook.md`

- [ ] **Step 1: Widen the container + roomier desktop spacing**

In `src/app/app/page.tsx`, change the `<main>` opening tag:
```tsx
      <main className="mx-auto grid w-full max-w-5xl gap-6 p-6 pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-6 md:grid-cols-[1fr_320px]">
```
to:
```tsx
      <main className="mx-auto grid w-full max-w-6xl gap-6 p-6 pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:gap-8 md:p-8 md:pb-8 md:grid-cols-[1fr_360px]">
```
(Changed: `max-w-5xl`→`max-w-6xl`; added `md:gap-8 md:p-8`; `md:pb-6`→`md:pb-8`; `[1fr_320px]`→`[1fr_360px]`.)

Change the left-column wrapper:
```tsx
        <div className="flex flex-col gap-6">
```
to:
```tsx
        <div className="flex flex-col gap-6 md:gap-7">
```

- [ ] **Step 2: List primary-text bump (money)**

In `src/components/money-list.tsx`, change:
```tsx
                  <div className="text-sm font-medium text-foreground">
```
to:
```tsx
                  <div className="text-sm md:text-base font-medium text-foreground">
```

- [ ] **Step 3: List primary-text bump (task)**

In `src/components/task-list.tsx`, change the title span:
```tsx
              <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
```
to:
```tsx
              <span className={`md:text-base ${isCompleted ? 'text-muted-foreground line-through' : ''}`}>
```

- [ ] **Step 4: List primary-text bump (learning)**

In `src/components/learning-list.tsx`, change:
```tsx
            <p className="text-sm">{e.text}</p>
```
to:
```tsx
            <p className="text-sm md:text-base">{e.text}</p>
```

- [ ] **Step 5: List primary-text bump (notes)**

In `src/components/notes-list.tsx`, change:
```tsx
            <p className="text-sm font-medium">{e.title || truncatePreview(e.body)}</p>
```
to:
```tsx
            <p className="text-sm md:text-base font-medium">{e.title || truncatePreview(e.body)}</p>
```

- [ ] **Step 6: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-23-pulse-desktop-polish-qa-runbook.md`:

```markdown
# Desktop Polish — QA Runbook (on-device, laptop)

1. Notes tab → the right column now shows a "Notes" summary card (This week / Total / Top tags), matching the other tabs (no empty gap).
2. On a wide window, the content uses more width than before (container ~1152px, sidebar ~360px) — less marooned in the middle.
3. Desktop feels roomier: more padding/gaps around and between sections (mobile unchanged).
4. List rows (money / task / learning / note primary text) read at a comfortable size on desktop — NOT too big. If any list text looks oversized, tell me and I'll revert the `md:text-base` bump.
5. Phone view is unchanged (all changes are md+ only).
```

- [ ] **Step 7: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors; existing suite green (no new tests); build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/app/page.tsx src/components/money-list.tsx src/components/task-list.tsx src/components/learning-list.tsx src/components/notes-list.tsx docs/superpowers/notes/2026-07-23-pulse-desktop-polish-qa-runbook.md
git commit -m "feat(desktop): wider container + md: spacing + list type bump + QA runbook"
```

---

## Post-implementation

- No opus review (presentational). Merge to `main` (auto-deploys); no D1 migration. Verify CI + Deploy both `success` + prod HTTP 200.
- **Owner verification (I can't see it):** on a laptop, confirm §1–5 of the QA runbook — especially that the list type bump (§4) doesn't read too large; flag anything still rough.
