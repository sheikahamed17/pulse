# Global Search — Design

**Date:** 2026-07-23
**Status:** Approved (design)
**Feature:** A header search that finds matches across all four domains (money / tasks / learning / notes) and jumps to the exact row.

## Goal

There's no way to find "that thing about rent" without knowing which tab it's in. Add one search entry point (header icon → full-screen overlay) that searches all four domains at once and, on tapping a result, switches to that tab and scrolls to + briefly flashes the row.

## Non-goals

- No fuzzy/ranked search — plain case-insensitive substring (same as the existing `searchNotes`). No new dependency, no index, no schema/sync change.
- No search of budgets/projects/insights (the four entity lists only).
- Does not reset an active filter/search on the destination tab (documented limitation).

## Architecture

**Unit 1 — `src/lib/search-all.ts` (pure, tested).**

```ts
import type { Tab } from '@/hooks/use-tab-state'
export type SearchResult = { kind: Tab; id: string; label: string; snippet: string }
export type SearchGroup = { kind: Tab; heading: string; items: SearchResult[]; truncated: boolean }

export function searchAll(
  query: string,
  data: {
    money: MoneyEntryRow[]
    tasks: TaskRow[]
    learnings: LearningRow[]
    notes: NoteRow[]
    categoryById: Map<string, CategoryRow>
  },
): SearchGroup[]
```

- Trimmed, lowercased substring match. Empty/whitespace query → `[]` (an overlay must not dump everything).
- Match fields: **money** → `description` + category name (`categoryById`); **task** → `title` + `tags`; **learning** → `text` + `tags` + `attribution`; **note** → `title` + `body` + `tags`.
- `label` / `snippet` per kind: money → `label = description || categoryName || 'Uncategorized'`, `snippet = <formatted amount>` (`currencySymbol(currency)` + `amount/100`, whole for JPY); task → `label = title`, `snippet = ''`; learning → `label = truncate(text, 80)`, `snippet = attribution ?? ''`; note → `label = title || truncate(body, 80)`, `snippet = title ? truncate(body, 80) : ''`.
- Only non-empty groups, in tab order (money → tasks → learning → notes). Each group capped at **25** items with `truncated: true` when more matched (the overlay shows a "refine to see more" note — no silent cap).

**Unit 2 — `src/components/global-search.tsx`.** A glass modal (`fixed inset-0`, `role="dialog" aria-modal`, backdrop + ✕ + Escape to close, autofocus input, top safe-area inset). Mounts the four domain hooks (`useMoneyEntries`, `useTasks(userId,'all')`, `useLearnings`, `useNotes`) + `useCategories` **only while open**, builds `categoryById`, calls `searchAll(q, …)`, and renders grouped results — each item a button with a per-kind lucide icon (`Wallet`/`CheckCircle2`/`BookOpen`/`NotebookPen`), `label`, and muted `snippet`; clicking calls `onSelect(kind, id)`.

**Unit 3 — app-page wiring.** A `Search` icon button in the header (before the Settings link) sets `searchOpen`. `{searchOpen && <GlobalSearch userId onClose onSelect />}`. `onSelect(kind, id)` → `setSearchOpen(false)`, `setTab(kind)`, `setFocusId(id)`. A `useEffect` keyed on `[focusId, activeTab]` finds `#pulse-row-{focusId}`, `scrollIntoView({ block: 'center', behavior: 'smooth' })`, adds `.pulse-flash` for ~1.2s, then clears `focusId` — with a **bounded retry** (~8 × 120ms) because the destination list renders async via `useLiveQuery` after the tab switch.

**Unit 4 — row anchors + flash.** Each list row gets `id={`pulse-row-${entity.id}`}`: money/learning/notes on their `<li className="relative">`; task on `renderRow`'s `<div className="relative">` (covers parent + sub-tasks). A `.pulse-flash` keyframe in `globals.css` (an accent-2 ring that fades over 1.2s; `prefers-reduced-motion` → a static ring, no animation).

## Data flow

query → overlay's live domain data → `searchAll` → grouped results → tap → `onSelect` → `setTab` + `setFocusId` → scroll/flash effect. Pure client read over Dexie; **no schema / sync / agent / cron / dependency change**; Dexie stays v9.

## Error handling

- `searchAll` is pure/total.
- If the target row isn't in the DOM after the retries (an active filter/search on the destination tab hid it, or it doesn't exist), the scroll no-ops — the tab still switched. Documented limitation: a destination-tab filter can hide the jumped-to row.
- Escape / backdrop / ✕ all close; the overlay unmounts, tearing down its four `useLiveQuery` subscriptions.

## Testing

**Unit (`tests/lib/search-all.test.ts`):** money by description + by category name; task by title + by tag; learning by text; note by title + by body; case-insensitivity; empty query → `[]`; group order; the 25-cap `truncated` flag (26 matching notes). ~9 cases.

The overlay, tab-switch, and scroll/flash are QA-runbook-verified (`docs/superpowers/notes/2026-07-23-pulse-global-search-qa-runbook.md`) — jsdom has no layout/`scrollIntoView`.

## Plan shape

~4 tasks: (1) pure `search-all.ts` + tests; (2) `GlobalSearch` overlay; (3) page wiring (header Search icon + overlay mount + focus/scroll/flash effect + `.pulse-flash` css); (4) `pulse-row-{id}` anchors in the four lists + QA runbook. Opus whole-branch review (lenses: search correctness + cap/truncation; overlay mount/teardown + a11y; the async-render scroll retry; row-id anchors incl. task parent/child; no regression to the lists/tabs).

## Constraints (verbatim)

- No new dependency (`Search`/`Wallet`/`BookOpen`/`NotebookPen` in `lucide-react`). Locked stack. No schema/sync/cron change. Dexie v9.
- Plain case-insensitive substring (like `searchNotes`). Empty query → no results.
- Domain hooks mount only while the overlay is open.
- Result cap 25/domain with a visible "refine" note (no silent truncation).
- `.pulse-flash` respects `prefers-reduced-motion`.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck` / `lint` / `test` / `build`).
