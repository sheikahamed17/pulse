# Pulse — Entry timestamps, list filter/sort, informative breakdown + category-resolution fix (design)

**Date:** 2026-08-11
**Status:** approved for planning

## Problem

Three UX gaps + one correctness bug, all in the client display layer:

1. **No visible timestamp on entries.** Money/task/learning/note rows show content but never *when* the entry is from. `occurred_at` exists on every row but isn't surfaced.
2. **Phantom "Uncategorized" in the "Spent · this month" breakdown.** Sheik sees e.g. `Uncategorized ₹15,182` and `Uncategorized ₹3,575` that exactly duplicate `Rent`/`Shopping`. **Root cause (confirmed by reconstructing the server op_log):** the server data is clean — every August expense resolves to a real active category, zero uncategorized. Both breakdown paths (`money-card.tsx:33`, `query-answer-card.tsx:63-66`) resolve category names **only against active categories** (`useCategories` filters out `deleted_at`/`is_archived`). Any entry still pointing at an **archived/tombstoned** category (leftovers from the category-dedupe migration + device divergence) therefore falls into a separate "Uncategorized" bucket instead of showing its real name. Live duplicate categories also exist on the account (Bike ×3, Groceries ×2).
3. **Breakdown is not informative enough.** Only top-3 spend categories, no %, no counts, month-only, no income/net.
4. **No way to filter/sort a list to see a specific category** (or status, tag, date, amount).

## Goals

1. **Timestamps** on every entry row across all 4 tabs (money, tasks, learning, notes): relative when recent, absolute otherwise, full date-time on demand — timezone-aware.
2. **Category-resolution fix:** resolve names against ALL categories (incl. archived/tombstoned) and group breakdowns by resolved identity (name+kind) so old-id and canonical rows — and live dupes — collapse into one correct row. Kills the phantom-Uncategorized bug class.
3. **Informative breakdown** (money-card): all spend categories (expandable), each with amount + % of total + entry count; real week/month toggle; income + net summary.
4. **Filter + sort** on all 4 lists via a shared control bar + pure per-domain helpers. Tapping a breakdown category filters the Money list to it.
5. **Device reconciliation** (post-ship, owner action): fresh resync / clear PWA local data so stale category ids clear; verify the phantom is gone.

## Non-goals (YAGNI)

- **No schema / migration / sync-contract / entity_kind changes.** This is a pure client read/display layer (same shape as the query-agents feature). Category name resolution, filtering, sorting, and breakdown math are all computed over data already in Dexie.
- No server-side changes, no new API routes, no cron changes.
- Not auto-merging the live duplicate categories in the data (the resolution fix makes them *display* correctly; an actual dedupe of Bike ×3 / Groceries ×2 is a separate optional cleanup, offered separately).
- No new dependency (`date-fns` is already installed).
- Not persisting filter/sort state to the server; filter/sort is per-list local UI state (a URL param is used only for the breakdown→Money deep-link).

## Architecture

### Part 1 — Category-resolution fix (correctness-critical)

- **Name resolution over ALL categories.** Add a hook variant that returns every category for the user regardless of `deleted_at`/`is_archived` (e.g. `useAllCategories(userId)`), used **only for name lookup** — pickers keep using active-only `useCategories`.
- **Group breakdowns by resolved identity.** A pure helper keys a breakdown row by the resolved `(name, kind)` (falling back to the raw id when a name truly can't be found), not by raw `category_id`. This collapses:
  - an entry on an old tombstoned "Rent" id + an entry on canonical `cat-…-rent` → one "Rent" row;
  - the live Bike ×3 / Groceries ×2 dupes → one row each.
- Applied in both `computeMoneyBreakdown` (via a richer `categoryNameOf` that resolves all categories) and money-card's `topNByCategoryWithConversion`. The genuinely-unresolvable bucket (null category_id, or an id absent from *all* categories) stays labeled "Uncategorized" — but that now reflects real uncategorized spend only.

### Part 2 — Entry timestamps (all 4 lists)

- **Shared `<EntryTimestamp occurredAt tz />`** (`src/components/entry-timestamp.tsx`): relative via `date-fns` `formatDistanceToNow` when `< 7 days`, else absolute `format` ("MMM d · h:mm a"); full ISO-local date-time exposed via `title` (and it is a `<time dateTime>` element for a11y). Timezone from `useUserPrefs().prefs.tz`.
- Wired into each list row: `money-list.tsx`, and the task/learning/note list components.

### Part 3 — Informative breakdown (money-card)

- **New pure `computeSpendBreakdown(entries, { resolveName, toPrimary })`** returning, per resolved category: `{ name, icon, amount, count, pct }` sorted desc, plus totals. Reuses the Part-1 resolver.
- money-card renders **all** rows (scroll/expand past N), each: icon · name · amount · **pct%** · **count** · bar.
- **Week/month toggle** wired to the existing `PeriodKind` stub (state + the existing `currentPeriodRange`/`previousPeriodRange`).
- **Income + net** line: earned (sum of `in`) and net = income − spend for the period.

### Part 4 — Filter + sort (all 4 lists)

- **Shared `<ListControls>`** (`src/components/list-controls.tsx`): a filter chip/dropdown row + a sort dropdown, generic over a domain-supplied config (available filters + sort options + current state + change handlers). One row above the list, 44px targets.
- **Pure per-domain filter+sort helpers** in `src/lib` (e.g. `filterSortMoney`, `filterSortTasks`, `filterSortLearning`, `filterSortNotes`), each taking rows + a filter/sort state and returning the filtered+sorted rows. Unit-tested.
  - **Money:** filter category (by resolved identity) / source / direction / date-range; sort date | amount.
  - **Tasks:** filter status / priority / project / tag; sort due | created.
  - **Learning / Notes:** filter tag; sort date.
- **Breakdown → Money filter:** tapping a category row in money-card sets the Money list's category filter (via a shared state on the Money tab, or a `?category=` param the list reads once).

## Data flow

```
Dexie rows ──▶ list component
                 ├─ filterSort<Domain>(rows, filterState, sortState)  [pure]
                 └─ render rows + <EntryTimestamp>

money-card:  entries ──▶ computeSpendBreakdown(entries, {resolveName(all cats), toPrimary})  [pure]
             resolveName = lookup over useAllCategories (active + archived + tombstoned)
             tap category ─▶ set Money-tab category filter
```

## Correctness invariants (tested)

1. **Resolution:** an entry whose `category_id` matches an archived/tombstoned category resolves to that category's **name**, not "Uncategorized." Two categories with the same `(name, kind)` collapse into one breakdown row whose amount is the **sum** (no double count, no phantom bucket).
2. **Truly-uncategorized only:** null `category_id` (or an id absent from *all* categories) → one "Uncategorized" row; a fully-categorized month yields **no** "Uncategorized" row.
3. **Breakdown math:** per-row `pct` = row.amount / total (0 when total 0); `count` = number of contributing entries; sum of row amounts == period spend total.
4. **Filter/sort purity:** helpers are deterministic, don't mutate input, and compose (filter then sort); an empty filter returns all rows in the chosen sort order.
5. **Timestamp:** relative under threshold, absolute above, tz-aware; renders a valid `<time dateTime>`.
6. **No data-layer change:** no op is written by any of this (display-only); existing sync/materialize tests stay green.

## Testing

- **Pure units:** resolver + `computeSpendBreakdown` (archived-id resolves, same-name merge, pct/count, uncategorized-only-when-real); `filterSort*` per domain; timestamp formatting boundary.
- **Existing** `query-money-exec.test.ts` breakdown tests updated for identity-grouping; `computeMoneyBreakdown` callers stay green.
- Components are presentational → `tsc --noEmit` + `pnpm build` + QA runbook; no render harness.
- Full `pnpm test` + `pnpm typecheck` + `pnpm build` green; **opus whole-branch review** (Part 1 is correctness-critical).

## Global constraints

- **Client-only; no schema/migration/sync-contract/entity_kind/dependency/cron changes.**
- Name resolution for **display** uses all categories; **pickers** stay active-only.
- Reuse `date-fns` (installed), existing hooks (`useUserPrefs`, `useFxRates`, `useCategories`), FX conversion (`convertViaRates`), and `currencySymbol`.
- Amounts are minor units (÷100 for display except JPY); preserve existing FX-conversion behavior in money aggregates.
- `tsc --noEmit` runs in the gate (vitest/esbuild does not typecheck).
- Merging to `main` auto-deploys; verify CI + Deploy green + prod `/app` 200 afterward.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
- Owner post-ship: reconcile device (resync / clear PWA data) → confirm phantom Uncategorized gone.
