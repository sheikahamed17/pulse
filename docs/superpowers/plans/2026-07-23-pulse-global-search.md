# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A header search overlay that finds matches across money/tasks/learning/notes and jumps to the exact row (tab switch + scroll + flash).

**Architecture:** A pure `searchAll` over the four domains + a `GlobalSearch` overlay component (mounts the domain hooks only while open) + app-page wiring (a header Search icon, the overlay, and a focus/scroll/flash effect) + `pulse-row-{id}` anchors on the four lists.

**Tech Stack:** React 19, TypeScript, Dexie v9 (`useLiveQuery`), Tailwind 4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-pulse-global-search-design.md`

## Global Constraints

- No new dependency (`Search`/`Wallet`/`BookOpen`/`NotebookPen`/`X` in `lucide-react`). No schema/sync/cron/agent change. Dexie v9.
- Plain case-insensitive substring (like `searchNotes`). Empty/whitespace query → no results.
- Domain hooks mount only while the overlay is open (`{searchOpen && <GlobalSearch/>}`).
- Result cap 25/domain with a visible "refine" note (no silent truncation).
- `.pulse-flash` respects `prefers-reduced-motion`.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — separate; lint 0 errors).

## File Structure

- Create: `src/lib/search-all.ts`, `tests/lib/search-all.test.ts`, `src/components/global-search.tsx`, `docs/superpowers/notes/2026-07-23-pulse-global-search-qa-runbook.md`.
- Modify: `src/app/app/page.tsx` (header icon + overlay + focus effect), `src/app/globals.css` (`.pulse-flash`), `src/components/{money,learning,notes}-list.tsx` + `src/components/task-list.tsx` (`pulse-row-{id}` anchors).

---

### Task 1: Pure `search-all.ts`

**Files:**
- Create: `src/lib/search-all.ts`
- Test: `tests/lib/search-all.test.ts`

**Interfaces:**
- Produces: `type SearchResult`, `type SearchGroup`, `searchAll(query, data): SearchGroup[]` (see spec).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/search-all.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { searchAll } from '@/lib/search-all'
import type { CategoryRow } from '@/lib/dexie'

/* eslint-disable @typescript-eslint/no-explicit-any */
const cats = new Map<string, CategoryRow>([['c1', { id: 'c1', name: 'Rent', icon: '🏠' } as unknown as CategoryRow]])
const money = [{ id: 'm1', description: 'July payment', category_id: 'c1', amount: 750000, currency: 'INR' }] as any
const tasks = [{ id: 't1', title: 'Pay rent', tags: ['home'] }, { id: 't2', title: 'Buy milk', tags: [] }] as any
const learnings = [{ id: 'l1', text: 'Learned about rent control', tags: [], attribution: 'blog' }] as any
const notes = [{ id: 'n1', title: 'Landlord', body: 'deposit is 2x rent', tags: [] }, { id: 'n2', title: null, body: 'random note', tags: ['misc'] }] as any

function run(q: string) { return searchAll(q, { money, tasks, learnings, notes, categoryById: cats }) }

describe('searchAll', () => {
  it('empty query → no groups', () => { expect(run('  ')).toEqual([]) })

  it('matches money by category name + formats the amount snippet', () => {
    const g = run('rent').find(x => x.kind === 'money')
    expect(g?.items.map(i => i.id)).toContain('m1')
    expect(g?.items[0].snippet).toContain('7,500') // 750000/100
  })

  it('matches task by title and by tag; case-insensitive', () => {
    expect(run('RENT').find(x => x.kind === 'tasks')?.items.map(i => i.id)).toEqual(['t1'])
    expect(run('home').find(x => x.kind === 'tasks')?.items.map(i => i.id)).toEqual(['t1'])
  })

  it('matches learning by text and attribution', () => {
    expect(run('rent control').find(x => x.kind === 'learning')?.items.map(i => i.id)).toEqual(['l1'])
    expect(run('blog').find(x => x.kind === 'learning')?.items.map(i => i.id)).toEqual(['l1'])
  })

  it('matches note by title and body; label falls back to body when no title', () => {
    expect(run('landlord').find(x => x.kind === 'notes')?.items.map(i => i.id)).toEqual(['n1'])
    expect(run('random').find(x => x.kind === 'notes')?.items[0].label).toBe('random note')
  })

  it('returns matching groups in tab order', () => {
    // 'rent' matches money (category), task t1, learning l1, note n1 (body)
    expect(run('rent').map(g => g.kind)).toEqual(['money', 'tasks', 'learning', 'notes'])
  })

  it('caps at 25 items per group and flags truncated', () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `x${i}`, title: 'rent task', tags: [] })) as any
    const g = searchAll('rent', { money: [], tasks: many, learnings: [], notes: [], categoryById: cats }).find(x => x.kind === 'tasks')
    expect(g?.items).toHaveLength(25)
    expect(g?.truncated).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/lib/search-all.test.ts`
Expected: FAIL — cannot resolve `@/lib/search-all`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/search-all.ts`:

```ts
import type { Tab } from '@/hooks/use-tab-state'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow, CategoryRow } from '@/lib/dexie'
import { currencySymbol } from '@/lib/currency'

export type SearchResult = { kind: Tab; id: string; label: string; snippet: string }
export type SearchGroup = { kind: Tab; heading: string; items: SearchResult[]; truncated: boolean }

const CAP = 25

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function moneySnippet(e: MoneyEntryRow): string {
  const major = e.currency === 'JPY' ? e.amount : e.amount / 100
  return `${currencySymbol(e.currency)}${major.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function group(kind: Tab, heading: string, items: SearchResult[]): SearchGroup | null {
  if (items.length === 0) return null
  return { kind, heading, items: items.slice(0, CAP), truncated: items.length > CAP }
}

export function searchAll(
  query: string,
  data: {
    money: MoneyEntryRow[]
    tasks: TaskRow[]
    learnings: LearningRow[]
    notes: NoteRow[]
    categoryById: Map<string, CategoryRow>
  },
): SearchGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(q)
  const hasTag = (tags: string[] | null | undefined) => (tags ?? []).some(t => t.toLowerCase().includes(q))

  const money: SearchResult[] = data.money
    .filter(e => !e.deleted_at)
    .filter(e => has(e.description) || has(e.category_id ? data.categoryById.get(e.category_id)?.name : undefined))
    .map(e => {
      const catName = e.category_id ? data.categoryById.get(e.category_id)?.name : undefined
      return { kind: 'money', id: e.id, label: e.description || catName || 'Uncategorized', snippet: moneySnippet(e) }
    })

  const tasks: SearchResult[] = data.tasks
    .filter(t => !t.deleted_at)
    .filter(t => has(t.title) || hasTag(t.tags))
    .map(t => ({ kind: 'tasks', id: t.id, label: t.title, snippet: '' }))

  const learnings: SearchResult[] = data.learnings
    .filter(l => !l.deleted_at)
    .filter(l => has(l.text) || hasTag(l.tags) || has(l.attribution))
    .map(l => ({ kind: 'learning', id: l.id, label: truncate(l.text, 80), snippet: l.attribution ?? '' }))

  const notes: SearchResult[] = data.notes
    .filter(n => !n.deleted_at)
    .filter(n => has(n.title) || has(n.body) || hasTag(n.tags))
    .map(n => ({ kind: 'notes', id: n.id, label: n.title || truncate(n.body, 80), snippet: n.title ? truncate(n.body, 80) : '' }))

  return [
    group('money', 'Money', money),
    group('tasks', 'Tasks', tasks),
    group('learning', 'Learn', learnings),
    group('notes', 'Notes', notes),
  ].filter((g): g is SearchGroup => g !== null)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/lib/search-all.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search-all.ts tests/lib/search-all.test.ts
git commit -m "feat(search): pure searchAll over the four domains"
```

---

### Task 2: `GlobalSearch` overlay component

**Files:**
- Create: `src/components/global-search.tsx`

**Interfaces:**
- Consumes: `searchAll`; `useMoneyEntries`, `useTasks`, `useLearnings`, `useNotes`, `useCategories`; `Tab`.
- Produces: `GlobalSearch({ userId, onClose, onSelect }: { userId: string; onClose: () => void; onSelect: (kind: Tab, id: string) => void })`.

- [ ] **Step 1: Write the component**

Create `src/components/global-search.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, X, Wallet, CheckCircle2, BookOpen, NotebookPen, type LucideIcon } from 'lucide-react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useTasks } from '@/hooks/use-tasks'
import { useLearnings } from '@/hooks/use-learnings'
import { useNotes } from '@/hooks/use-notes'
import { useCategories } from '@/hooks/use-categories'
import { searchAll } from '@/lib/search-all'
import type { Tab } from '@/hooks/use-tab-state'

const ICON: Record<Tab, LucideIcon> = { money: Wallet, tasks: CheckCircle2, learning: BookOpen, notes: NotebookPen }

export function GlobalSearch({ userId, onClose, onSelect }: { userId: string; onClose: () => void; onSelect: (kind: Tab, id: string) => void }) {
  const [q, setQ] = useState('')
  const money = useMoneyEntries(userId)
  const tasks = useTasks(userId, 'all')
  const learnings = useLearnings(userId)
  const notes = useNotes(userId)
  const categories = useCategories(userId)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const groups = searchAll(q, { money, tasks, learnings, notes, categoryById })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative mx-auto mt-[calc(1rem_+_env(safe-area-inset-top))] flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search everything…"
            aria-label="Search everything"
            className="min-h-[44px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto">
          {q.trim() && groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No matches for “{q.trim()}”.</p>
          )}
          {groups.map(g => {
            const Icon = ICON[g.kind]
            return (
              <section key={g.kind} className="flex flex-col gap-1">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.heading}</h3>
                <ul className="flex flex-col gap-1">
                  {g.items.map(it => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(it.kind, it.id)}
                        className="glass-soft flex w-full items-center gap-2 rounded-xl px-3 py-2 min-h-[44px] text-left text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      >
                        <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{it.label}</span>
                        {it.snippet && <span className="flex-shrink-0 font-mono tabular-nums text-xs text-muted-foreground">{it.snippet}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {g.truncated && <p className="px-1 text-xs text-muted-foreground">More matches — refine your search.</p>}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: clean. (If `useLearnings`/`useNotes`/`useCategories` have a different signature than `(userId)`, adjust the call — check each hook's export.)

- [ ] **Step 3: Commit**

```bash
git add src/components/global-search.tsx
git commit -m "feat(search): GlobalSearch overlay (mounts domain hooks while open)"
```

---

### Task 3: App-page wiring + `.pulse-flash`

**Files:**
- Modify: `src/app/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `GlobalSearch` (Task 2); existing `setTab`/`activeTab` from `useTabState`.

- [ ] **Step 1: Add the `.pulse-flash` keyframe**

In `src/app/globals.css`, near the existing `@keyframes aurora-drift` line, add:

```css
@keyframes pulse-flash { 0% { box-shadow: 0 0 0 2px var(--accent-2) } 100% { box-shadow: 0 0 0 2px transparent } }
.pulse-flash { animation: pulse-flash 1.2s ease-out; border-radius: 1rem; }
@media (prefers-reduced-motion: reduce) { .pulse-flash { animation: none; box-shadow: 0 0 0 2px var(--accent-2) } }
```

- [ ] **Step 2: Imports + state in the app page**

In `src/app/app/page.tsx`:

Add `Search` to the lucide import on line 6:
```ts
import { Settings, Search } from 'lucide-react'
```

Add the component import (near the other component imports, e.g. after the `UndoProvider` import):
```ts
import { GlobalSearch } from '@/components/global-search'
```

Add state next to the other `useState`s (near `draft`/`editId`):
```ts
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
```

- [ ] **Step 3: The focus/scroll/flash effect**

In `src/app/app/page.tsx`, add this effect among the other `useEffect`s in the component body (it reads `activeTab` from `useTabState`; place it after that is declared):

```tsx
  useEffect(() => {
    if (!focusId) return
    let tries = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const tryScroll = () => {
      const el = document.getElementById(`pulse-row-${focusId}`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.classList.add('pulse-flash')
        timers.push(setTimeout(() => el.classList.remove('pulse-flash'), 1200))
        setFocusId(null)
        return
      }
      if (tries++ < 8) timers.push(setTimeout(tryScroll, 120))
      else setFocusId(null)
    }
    timers.push(setTimeout(tryScroll, 0))
    return () => { timers.forEach(clearTimeout) }
  }, [focusId, activeTab])
```

- [ ] **Step 4: Header Search icon**

In the header (the `<div className="flex items-center gap-3">` on ~line 634, before the Settings `<Link>`), add:

```tsx
              <button
                type="button"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                <Search className="h-5 w-5" />
              </button>
```

- [ ] **Step 5: Mount the overlay**

Just before the closing `</UndoProvider>` (the final one, after the mobile tab bar `<div className="md:hidden">…</div>`), add:

```tsx
      {searchOpen && (
        <GlobalSearch
          userId={user.id}
          onClose={() => setSearchOpen(false)}
          onSelect={(kind, id) => { setSearchOpen(false); setTab(kind); setFocusId(id) }}
        />
      )}
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck` (clean) and `pnpm test tests/lib/search-all.test.ts` (still green). Full gate after Task 4.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/page.tsx src/app/globals.css
git commit -m "feat(search): header search icon + overlay + scroll/flash focus effect"
```

---

### Task 4: `pulse-row-{id}` anchors in the four lists + QA runbook

**Files:**
- Modify: `src/components/money-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx`, `src/components/task-list.tsx`
- Create: `docs/superpowers/notes/2026-07-23-pulse-global-search-qa-runbook.md`

- [ ] **Step 1: money-list anchor**

In `src/components/money-list.tsx`, change the row `<li>`:
```tsx
            <li key={e.id} className="relative">
```
to:
```tsx
            <li key={e.id} id={`pulse-row-${e.id}`} className="relative">
```

- [ ] **Step 2: learning-list anchor**

In `src/components/learning-list.tsx`, change:
```tsx
        <li key={e.id} className="relative">
```
to:
```tsx
        <li key={e.id} id={`pulse-row-${e.id}`} className="relative">
```

- [ ] **Step 3: notes-list anchor**

In `src/components/notes-list.tsx`, change:
```tsx
        <li key={e.id} className="relative">
```
to:
```tsx
        <li key={e.id} id={`pulse-row-${e.id}`} className="relative">
```

- [ ] **Step 4: task-list anchor**

In `src/components/task-list.tsx`, in `renderRow`, change the wrapper:
```tsx
      <div className="relative">
```
to:
```tsx
      <div id={`pulse-row-${t.id}`} className="relative">
```

- [ ] **Step 5: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-23-pulse-global-search-qa-runbook.md`:

```markdown
# Global Search — QA Runbook (on-device)

1. Tap the 🔍 icon in the header → a full-screen search overlay opens with the field autofocused.
2. Type a term that exists in multiple domains (e.g. "rent") → results appear grouped under Money / Tasks / Learn / Notes, each with an icon + label (+ amount for money).
3. Tap a result → the overlay closes, the app switches to that domain's tab, scrolls the row into view, and the row flashes an accent ring for ~1s.
4. Type gibberish → "No matches for …".
5. Clear the field → results disappear (empty query shows nothing).
6. Escape / tap the dark backdrop / tap ✕ → the overlay closes.
7. Case-insensitivity: "RENT" and "rent" return the same results.
8. A domain with >25 matches shows "More matches — refine your search."
9. Reduced motion: the row shows a static ring instead of the flash animation.

Known limitation: if the destination tab has an active filter/search that hides the matched row, the jump switches tabs but the flash won't fire (the row isn't rendered).
```

- [ ] **Step 6: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors; tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/money-list.tsx src/components/learning-list.tsx src/components/notes-list.tsx src/components/task-list.tsx docs/superpowers/notes/2026-07-23-pulse-global-search-qa-runbook.md
git commit -m "feat(search): pulse-row anchors in the four lists + QA runbook"
```

---

## Post-implementation

- Opus whole-branch review (lenses: search correctness + cap/truncation; overlay mount/teardown + a11y + Escape/backdrop; the async-render scroll retry + cleanup; row-id anchors incl. task parent/child; no regression to the lists/tabs/swipe/undo).
- Merge to `main` (auto-deploys); no D1 migration. Verify CI + Deploy both `success` + prod HTTP 200.
- Owner follow-up: run the QA runbook on-device (esp. the jump-to-row scroll/flash across all four domains).
