# Entry UX & Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the phantom-"Uncategorized" breakdown bug, show timestamps on every entry, make the "Spent · this month" card informative, and add filter + sort across all four lists.

**Architecture:** Pure client display layer — no schema/migration/sync/entity_kind/dependency/cron changes. New pure helpers in `src/lib` (unit-tested) + shared presentational components, wired into existing list components and the `/app` tab page. Category names resolve against ALL categories (incl. archived/tombstoned) so leftover ids display correctly and same-named categories merge.

**Tech Stack:** Next 16 / React 19 / Tailwind 4 / Dexie / `date-fns` (installed) / vitest.

## Global Constraints

- Client-only. NO schema/migration/sync-contract/entity_kind/dependency/cron changes; no new API routes; no server edits.
- Name resolution for **display** uses ALL categories; **pickers** stay active-only (`useCategories`).
- Amounts are minor units; display divides by 100 EXCEPT `JPY` (whole). Preserve existing FX conversion via `convertViaRates`.
- Reuse existing: `formatLocalDateTime`/`formatLocalDate` (`src/lib/format.ts`), `useUserPrefs`, `useFxRates`, `useCategories`, `currencySymbol` (`src/lib/currency`), `SwipeRow`, `date-fns`.
- `tsc --noEmit` MUST run in the gate (vitest/esbuild does not typecheck). Gate = `pnpm typecheck && pnpm test && pnpm build`.
- Merging to `main` auto-deploys; verify CI + Deploy green + prod `/app` 200 after.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. `git add` only named files.

## Row types (verbatim, from `src/lib/dexie.ts`)

- `MoneyEntryRow`: `{ id, user_id, amount:number, currency:string, direction:'out'|'in', category_id:string|null, description:string|null, occurred_at:string, source:'voice'|'manual'|'recurring'|'receipt'|'sms'|'email', receipt_key, raw_input, recurring_rule_id, ... }`
- `TaskRow`: `{ id, title, due_at:string|null, priority:'low'|'medium'|'high', completed_at:string|null, tags:string[], project_id:string|null, created_at:string, ... }`
- `LearningRow`: `{ id, text, tags:string[], attribution:string|null, occurred_at:string, ... }`
- `NoteRow`: `{ id, title:string|null, body:string, tags:string[], occurred_at:string, ... }`
- `CategoryRow`: `{ id, user_id, name, kind:'spend'|'income', icon:string|null, sort_order:number, is_archived:number, deleted_at:string|null, ... }`

---

### Task 1: Category-resolution fix (shared resolver + `computeMoneyBreakdown` merge)

**Files:**
- Create: `src/lib/category-resolve.ts`
- Create: `src/hooks/use-all-categories.ts`
- Modify: `src/lib/query-money-exec.ts` (computeMoneyBreakdown)
- Test: `src/lib/category-resolve.test.ts` (create), `tests/lib/query-money-exec.test.ts` (exists — update)

**Interfaces:**
- Produces:
  - `type CategoryLike = { id: string; name: string; icon: string | null; kind: 'spend' | 'income' }`
  - `type CategoryIdentity = { name: string; icon: string | null; kind: 'spend' | 'income' }`
  - `makeCategoryResolver(cats: CategoryLike[]): (categoryId: string | null) => CategoryIdentity | null` — Map by id; returns the identity for any id present (active, archived, OR tombstoned), else null. `null`/absent id → null.
  - `useAllCategories(userId: string | undefined): CategoryRow[]` — every category for the user, NO `deleted_at`/`is_archived` filter (for name lookup only).
- Consumes (later tasks): the resolver + `useAllCategories`.

- [ ] **Step 1: Write failing test for `makeCategoryResolver`** — `src/lib/category-resolve.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { makeCategoryResolver } from './category-resolve'

const cats = [
  { id: 'active-rent', name: 'Rent', icon: '🏠', kind: 'spend' as const },
  { id: 'old-rent',    name: 'Rent', icon: null, kind: 'spend' as const },   // e.g. tombstoned dupe
]

describe('makeCategoryResolver', () => {
  it('resolves an id regardless of active/archived state', () => {
    const r = makeCategoryResolver(cats)
    expect(r('active-rent')?.name).toBe('Rent')
    expect(r('old-rent')?.name).toBe('Rent')   // key fix: leftover id still resolves
  })
  it('returns null for null or unknown id', () => {
    const r = makeCategoryResolver(cats)
    expect(r(null)).toBeNull()
    expect(r('ghost')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, confirm it fails** — `pnpm test category-resolve` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/category-resolve.ts`**

```ts
export type CategoryLike = { id: string; name: string; icon: string | null; kind: 'spend' | 'income' }
export type CategoryIdentity = { name: string; icon: string | null; kind: 'spend' | 'income' }

/** Build an id→identity lookup over ALL supplied categories (active, archived, or
 *  tombstoned). Used for DISPLAY name resolution so a leftover/deduped category_id
 *  still shows its real name instead of falling into "Uncategorized". */
export function makeCategoryResolver(cats: CategoryLike[]): (categoryId: string | null) => CategoryIdentity | null {
  const byId = new Map(cats.map(c => [c.id, { name: c.name, icon: c.icon, kind: c.kind }]))
  return (categoryId) => (categoryId ? byId.get(categoryId) ?? null : null)
}
```

- [ ] **Step 4: Run test, confirm pass.**

- [ ] **Step 5: Create `src/hooks/use-all-categories.ts`** (mirror `use-categories.ts` but no active filter)

```ts
'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CategoryRow } from '@/lib/dexie'

/** ALL categories for the user — including archived and tombstoned — for DISPLAY
 *  name resolution only. Pickers must keep using `useCategories` (active-only). */
export function useAllCategories(userId: string | undefined): CategoryRow[] {
  return useLiveQuery<CategoryRow[], CategoryRow[]>(
    async () => {
      if (!userId) return []
      return db.categories.where('user_id').equals(userId).toArray()
    },
    [userId],
    [],
  ) ?? []
}
```

- [ ] **Step 6: Update `computeMoneyBreakdown` to merge same-name buckets** — `src/lib/query-money-exec.ts`. Keep the signature (`entries`, `{direction, categoryNameOf}`, `toPrimary`) but after resolving each `category_id` bucket's name, MERGE buckets that share the same non-null `categoryName` into one (summing amounts); `null` names stay a single "Uncategorized" bucket. Replace the body of the `return` in `computeMoneyBreakdown` with:

```ts
  // Group raw by category_id (unchanged), then MERGE by resolved name so an old
  // tombstoned id and the canonical id — or same-named dupes — collapse into one
  // row instead of splitting into a real row + a phantom "Uncategorized".
  const byName = new Map<string | null, number>()   // key: resolved name (null = uncategorized)
  for (const [categoryId, amount] of totals.entries()) {
    const name = categoryNameOf(categoryId)
    byName.set(name, (byName.get(name) ?? 0) + amount)
  }
  return Array.from(byName.entries())
    .map(([categoryName, amount]) => ({ categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
```

(The `totals` Map-by-category_id loop above it is unchanged.)

- [ ] **Step 7: Update `tests/lib/query-money-exec.test.ts`** — the existing `computeMoneyBreakdown` describe block. `mockCategoryNameOf` currently maps `cat-food`→'Food', etc. ADD two cases:

```ts
  it('merges buckets that resolve to the same name (dupe/tombstoned ids)', () => {
    const entries: MoneyEntryRow[] = [
      { ...base, id: '1', category_id: 'cat-food',     amount: 1000 },
      { ...base, id: '2', category_id: 'cat-food-old', amount: 500  },  // resolves to 'Food' too
    ]
    const nameOf = (id: string | null) => (id === 'cat-food' || id === 'cat-food-old' ? 'Food' : null)
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: nameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ categoryName: 'Food', amount: 1500 })
  })
  it('keeps a single Uncategorized bucket for null/unresolved ids', () => {
    const entries: MoneyEntryRow[] = [
      { ...base, id: '1', category_id: null,   amount: 1000 },
      { ...base, id: '2', category_id: 'ghost', amount: 500 },   // resolves to null
    ]
    const nameOf = () => null
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: nameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ categoryName: null, amount: 1500 })
  })
```

(Define a `base` MoneyEntryRow literal from an existing test row — `direction:'out'`, `currency:'USD'`, the required null fields — near the top of the describe, or inline the full object like the existing tests do. Keep the existing "filters by direction / sorts / aggregates / includes uncategorized" tests passing.)

- [ ] **Step 8: Run `pnpm test query-money-exec category-resolve` + `pnpm typecheck`** → all pass.

- [ ] **Step 9: Commit** — `git add src/lib/category-resolve.ts src/lib/category-resolve.test.ts src/hooks/use-all-categories.ts src/lib/query-money-exec.ts tests/lib/query-money-exec.test.ts && git commit -m "fix: resolve category names across all categories + merge same-name breakdown buckets"`

---

### Task 2: `EntryTimestamp` component + timestamps on all four lists

**Files:**
- Create: `src/lib/entry-time.ts` (pure label helper)
- Create: `src/components/entry-timestamp.tsx`
- Test: `src/lib/entry-time.test.ts` (create)
- Modify: `src/components/money-list.tsx`, `src/components/task-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx`

**Interfaces:**
- Consumes: `formatLocalDateTime` (`src/lib/format.ts`), `date-fns`.
- Produces:
  - `entryTimeLabel(iso: string, tz: string, nowMs: number): { relative: string | null; absolute: string }` — `relative` set (e.g. "2h ago", "3d ago") when the entry is < 7 days old, else null; `absolute` = `formatLocalDateTime(iso, tz)`.
  - `<EntryTimestamp occurredAt={string} className?: string />` — renders a `<time dateTime={iso}>`; shows relative when recent else absolute; `title` = absolute. Reads tz from `useUserPrefs`.

- [ ] **Step 1: Failing test** — `src/lib/entry-time.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { entryTimeLabel } from './entry-time'

const NOW = Date.parse('2026-08-11T12:00:00Z')
describe('entryTimeLabel', () => {
  it('gives a relative label for recent entries', () => {
    const r = entryTimeLabel('2026-08-11T10:00:00Z', 'UTC', NOW)
    expect(r.relative).toMatch(/hour|hr|2/i)
    expect(r.absolute).toBeTruthy()
  })
  it('gives no relative label past the 7-day threshold', () => {
    const r = entryTimeLabel('2026-07-01T10:00:00Z', 'UTC', NOW)
    expect(r.relative).toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement `src/lib/entry-time.ts`**

```ts
import { formatDistanceToNow } from 'date-fns'
import { formatLocalDateTime } from '@/lib/format'

const RELATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Relative ("2 hours ago") when < 7 days old, else null; absolute always set. */
export function entryTimeLabel(iso: string, tz: string, nowMs: number): { relative: string | null; absolute: string } {
  const t = Date.parse(iso)
  const absolute = formatLocalDateTime(iso, tz)
  if (isNaN(t) || nowMs - t > RELATIVE_WINDOW_MS || t > nowMs) return { relative: null, absolute }
  return { relative: formatDistanceToNow(new Date(t), { addSuffix: true }), absolute }
}
```

- [ ] **Step 4: Run test, confirm pass.**

- [ ] **Step 5: Implement `src/components/entry-timestamp.tsx`**

```tsx
'use client'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { entryTimeLabel } from '@/lib/entry-time'

/** Compact, tz-aware entry timestamp: relative when recent, absolute otherwise;
 *  full date-time on hover/press via title. Uses occurred_at/created_at ISO. */
export function EntryTimestamp({ occurredAt, className }: { occurredAt: string; className?: string }) {
  const { prefs } = useUserPrefs()
  const { relative, absolute } = entryTimeLabel(occurredAt, prefs.tz, Date.now())
  return (
    <time dateTime={occurredAt} title={absolute} className={className ?? 'font-mono tabular-nums text-xs text-muted-foreground'}>
      {relative ?? absolute}
    </time>
  )
}
```

- [ ] **Step 6: Wire into `money-list.tsx`** — inside the row content `<div className="mt-1 flex flex-wrap items-center gap-2">` (the FX/receipt/source badges row), add as the first child: `<EntryTimestamp occurredAt={e.occurred_at} />`. Import `EntryTimestamp`.

- [ ] **Step 7: Wire into `learning-list.tsx` and `notes-list.tsx`** — replace the existing `<span className="font-mono tabular-nums …">{formatLocalDateTime(e.occurred_at, prefs.tz)}</span>` with `<EntryTimestamp occurredAt={e.occurred_at} />`. Remove now-unused `formatLocalDateTime`/`prefs` imports IF no longer referenced (check each file — notes/learning may still use `prefs` elsewhere; only drop unused).

- [ ] **Step 8: Wire into `task-list.tsx`** — tasks have no `occurred_at`; show when it was added via `created_at`. In the meta `<span className="text-xs text-muted-foreground">`, after the due-date block, add: `<EntryTimestamp occurredAt={t.created_at} className="ml-2 font-mono tabular-nums" />`. Keep the existing `due …` display (that's the due date, semantically different).

- [ ] **Step 9: `pnpm typecheck && pnpm test entry-time`** → pass.

- [ ] **Step 10: Commit** — named files only.

---

### Task 3: Informative "Spent" breakdown (money-card redesign)

**Files:**
- Create: `src/lib/spend-breakdown.ts`
- Create: `src/lib/spend-breakdown.test.ts`
- Modify: `src/components/money-card.tsx`

**Interfaces:**
- Consumes: `makeCategoryResolver` + `useAllCategories` (Task 1); `convertViaRates`; `currencySymbol`.
- Produces:
  - `type SpendRow = { name: string; icon: string | null; amount: number; count: number; pct: number }`
  - `type SpendBreakdown = { rows: SpendRow[]; spend: number; income: number; net: number }`
  - `computeSpendBreakdown(entries: MoneyEntryRow[], opts: { resolve: (id: string|null) => { name:string; icon:string|null } | null; toPrimary: (e: MoneyEntryRow) => number }): SpendBreakdown` — groups `out` entries by resolved identity (name+icon), merging same-name; `count` = # contributing entries; `pct` = amount/spend×100 (0 when spend 0); rows sorted desc; unresolved/null id → `{ name:'Uncategorized', icon:null }`. `income` = Σ `in`, `net` = income − spend.

- [ ] **Step 1: Failing test** — `src/lib/spend-breakdown.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { computeSpendBreakdown } from './spend-breakdown'
import type { MoneyEntryRow } from '@/lib/dexie'

const row = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'x', user_id: 'u', amount: 0, currency: 'INR', direction: 'out', category_id: null,
  description: null, occurred_at: '2026-08-01T00:00:00Z', source: 'manual', receipt_key: null,
  raw_input: null, recurring_rule_id: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const resolve = (id: string | null) =>
  id === 'rent' || id === 'rent-old' ? { name: 'Rent', icon: '🏠' } : id === 'shop' ? { name: 'Shopping', icon: '🛍️' } : null
const toPrimary = (e: MoneyEntryRow) => e.amount

describe('computeSpendBreakdown', () => {
  it('merges same-name ids, computes pct + count, and never phantom-Uncategorizes a resolvable id', () => {
    const b = computeSpendBreakdown([
      row({ id: '1', category_id: 'rent',     amount: 1000 }),
      row({ id: '2', category_id: 'rent-old', amount: 500 }),   // resolves to Rent
      row({ id: '3', category_id: 'shop',     amount: 500 }),
      row({ id: '4', direction: 'in', category_id: null, amount: 2000 }),
    ], { resolve, toPrimary })
    expect(b.spend).toBe(2000)
    expect(b.income).toBe(2000)
    expect(b.net).toBe(0)
    const rent = b.rows.find(r => r.name === 'Rent')!
    expect(rent.amount).toBe(1500)
    expect(rent.count).toBe(2)
    expect(rent.pct).toBe(75)
    expect(b.rows.some(r => r.name === 'Uncategorized')).toBe(false)
  })
  it('buckets a truly-null id under Uncategorized', () => {
    const b = computeSpendBreakdown([row({ id: '1', category_id: null, amount: 300 })], { resolve, toPrimary })
    expect(b.rows).toEqual([{ name: 'Uncategorized', icon: null, amount: 300, count: 1, pct: 100 }])
  })
})
```

- [ ] **Step 2: Run, confirm fail. Step 3: Implement `src/lib/spend-breakdown.ts`:**

```ts
import type { MoneyEntryRow } from '@/lib/dexie'

export type SpendRow = { name: string; icon: string | null; amount: number; count: number; pct: number }
export type SpendBreakdown = { rows: SpendRow[]; spend: number; income: number; net: number }

export function computeSpendBreakdown(
  entries: MoneyEntryRow[],
  opts: { resolve: (id: string | null) => { name: string; icon: string | null } | null; toPrimary: (e: MoneyEntryRow) => number },
): SpendBreakdown {
  const { resolve, toPrimary } = opts
  const agg = new Map<string, { icon: string | null; amount: number; count: number }>()
  let spend = 0, income = 0
  for (const e of entries) {
    const amt = toPrimary(e)
    if (e.direction === 'in') { income += amt; continue }
    spend += amt
    const id = resolve(e.category_id)
    const name = id?.name ?? 'Uncategorized'
    const cur = agg.get(name)
    if (cur) { cur.amount += amt; cur.count += 1 }
    else agg.set(name, { icon: id?.icon ?? null, amount: amt, count: 1 })
  }
  const rows = Array.from(agg.entries())
    .map(([name, v]) => ({ name, icon: v.icon, amount: v.amount, count: v.count, pct: spend ? (v.amount / spend) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { rows, spend, income, net: income - spend }
}
```

- [ ] **Step 4: Run test → pass.**

- [ ] **Step 5: Redesign `money-card.tsx`.** Replace `topNByCategoryWithConversion` + the top-3 `<ul>` with `computeSpendBreakdown`. Concretely:
  - Add `const [period, setPeriod] = useState<PeriodKind>('month')` (remove the `const period: PeriodKind = 'month'`), and a small week/month toggle in the `<header>` (two `min-h-[44px]` buttons; active gets `text-accent-2`).
  - Build resolver: `const allCats = useAllCategories(userId); const resolve = useMemo(() => makeCategoryResolver(allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind }))), [allCats])`.
  - `const toPrimary = useMemo(() => (e: MoneyEntryRow) => e.currency === prefs.primary_currency ? e.amount : (convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0), [prefs.primary_currency, rates, prefs.fx_overrides])`.
  - `const bd = useMemo(() => computeSpendBreakdown(current, { resolve, toPrimary }), [current, resolve, toPrimary])`. Use `bd.spend` for the headline (replaces the hand-rolled `primarySpend` loop — delete that loop and `previousPrimary`/`delta` can stay, or recompute delta from `bd` vs a previous breakdown; keep the existing `previous`/`delta` computation but swap its spend source to a second `computeSpendBreakdown(previous,…).spend`).
  - Render ALL `bd.rows` (not sliced): each row shows `{icon} {name}` · bar (`amount / bd.rows[0].amount`) · `{symbol}{amount/…}` · ` · {pct.toFixed(0)}% · {count}`. Collapse past 6 rows behind a "Show all (N)" toggle (`const [expanded,setExpanded]=useState(false)`).
  - Add an income + net line below the list: `Earned {symbol}{income} · Net {symbol}{net}` (net negative → rose, positive → emerald), only when `bd.income > 0`.
  - Keep the FX conversion footnote behavior.
  - Accept an optional `onSelectCategory?: (name: string) => void` prop; make each category row a `<button min-h-[44px]>` that calls `onSelectCategory?.(row.name)` (wired in Task 4).

- [ ] **Step 6: `pnpm typecheck && pnpm test spend-breakdown && pnpm build`** → pass (build catches the CSR/prerender + JSX).

- [ ] **Step 7: Commit** — named files only.

---

### Task 4: Money list filter + sort (and breakdown→filter link)

**Files:**
- Create: `src/lib/money-filter-sort.ts`, `src/lib/money-filter-sort.test.ts`
- Create: `src/components/money-controls.tsx`
- Modify: `src/components/money-list.tsx`, `src/components/money-card.tsx` (pass `onSelectCategory`), `src/app/app/page.tsx` (own the money filter/sort state; wire card→list)

**Interfaces:**
- Consumes: `makeCategoryResolver`/`useAllCategories` (identity for the category filter), row types.
- Produces:
  - `type MoneySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'`
  - `type MoneyFilter = { categoryName: string | null; source: MoneyEntryRow['source'] | null; direction: 'out' | 'in' | null; from: string | null; to: string | null }`
  - `filterSortMoney(rows: MoneyEntryRow[], filter: MoneyFilter, sort: MoneySort, resolve: (id:string|null)=>{name:string}|null): MoneyEntryRow[]` — pure; filters then sorts; category matches by RESOLVED name (so dupes/tombstoned ids match); `date` sorts by `occurred_at`, `amount` by `amount`; does not mutate input.
  - `EMPTY_MONEY_FILTER: MoneyFilter` constant.

- [ ] **Step 1: Failing test** — `src/lib/money-filter-sort.test.ts` covering: empty filter returns all in date-desc; category filter matches by resolved name across two ids; source filter; date-range bound `from<=occurred_at<to`; amount-desc/asc ordering; input not mutated. (Use a `row()` factory like Task 3.)

```ts
it('filters by resolved category name across dupe ids and sorts amount desc', () => {
  const rows = [row({id:'a',category_id:'rent',amount:100}), row({id:'b',category_id:'rent-old',amount:300}), row({id:'c',category_id:'shop',amount:200})]
  const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, categoryName:'Rent' }, 'amount-desc', resolve)
  expect(out.map(r=>r.id)).toEqual(['b','a'])
})
```

- [ ] **Step 2: Run fail. Step 3: Implement `money-filter-sort.ts`** (pure filter then `[...rows].sort(...)`; category via `resolve(r.category_id)?.name === filter.categoryName`; treat `filter.categoryName === 'Uncategorized'` as `resolve(...)==null`).

- [ ] **Step 4: Run test → pass.**

- [ ] **Step 5: Implement `src/components/money-controls.tsx`** — a one-row control bar (wraps on mobile, `min-h-[44px]` targets): a category `<select>` (options from `useCategories(userId,'spend')` + income cats, plus "All" and "Uncategorized"), a source `<select>` (All/manual/voice/receipt/sms/email/recurring), a direction toggle (All/Spent/Earned), and a sort `<select>` (Newest/Oldest/Amount ↓/Amount ↑). Props: `{ filter, sort, onFilter, onSort, userId }`. Date-range: a simple "This month/Last month/All" `<select>` mapping to `{from,to}` (compute via the same month-bounds logic as money-card's `currentPeriodRange`; export that helper or inline).

- [ ] **Step 6: Wire `MoneyList`** — add props `filter: MoneyFilter; sort: MoneySort`. Build `resolve` from `useAllCategories(userId)`; compute `const shown = useMemo(() => filterSortMoney(entries, filter, sort, resolve), [entries, filter, sort, resolve])`; map over `shown` instead of `entries`. Keep the empty-state (adjust copy when a filter is active: "No entries match this filter.").

- [ ] **Step 7: Wire `/app` money tab** — lift `const [moneyFilter, setMoneyFilter] = useState(EMPTY_MONEY_FILTER)` and `const [moneySort, setMoneySort] = useState<MoneySort>('date-desc')`. Render `<MoneyControls …/>` above `<MoneyList filter={moneyFilter} sort={moneySort} …/>`. Pass `onSelectCategory={(name)=>setMoneyFilter(f=>({...f, categoryName:name}))}` to BOTH `<MoneyCard>` instances (mobile + desktop sidebar). Tapping a breakdown category filters the list.

- [ ] **Step 8: `pnpm typecheck && pnpm test money-filter-sort && pnpm build`** → pass.

- [ ] **Step 9: Commit** — named files only.

---

### Task 5: Sort for tasks / learning / notes lists

**Files:**
- Create: `src/lib/list-sort.ts`, `src/lib/list-sort.test.ts`
- Create: `src/components/sort-control.tsx`
- Modify: `src/components/task-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx`, `src/app/app/page.tsx`

**Interfaces:**
- Produces:
  - `type DateSort = 'newest' | 'oldest'`
  - `type TaskSort = 'due' | 'created-desc' | 'created-asc' | 'priority'`
  - `sortByDate<T extends { occurred_at: string }>(rows: T[], dir: DateSort): T[]` (learning/notes)
  - `sortTasks(tasks: TaskRow[], sort: TaskSort): TaskRow[]` — `due` = due_at asc (nulls last); `created-*` by created_at; `priority` high→low then due.
  - `<SortControl options={{value,label}[]} value onChange />` — a `min-h-[44px]` `<select>`.

- [ ] **Step 1: Failing tests** — `list-sort.test.ts`: `sortByDate` newest/oldest; `sortTasks` due (nulls last), priority order, created; no mutation.

- [ ] **Step 2: Fail. Step 3: Implement `list-sort.ts`** (pure, copy-then-sort; priority rank `{high:0,medium:1,low:2}`).

- [ ] **Step 4: Test → pass.**

- [ ] **Step 5: `sort-control.tsx`** — generic labeled `<select>`.

- [ ] **Step 6: Wire learning/notes** — add prop `sort: DateSort`; apply `sortByDate(filtered, sort)` before render. In `/app`, add `const [learningSort,setLearningSort]=useState<DateSort>('newest')` (+ notes) and render `<SortControl>` next to the existing tag filter; pass down.

- [ ] **Step 7: Wire tasks** — add prop `sort: TaskSort`. `TaskList` currently renders grouped nodes via `visibleNodes(groupTasks(...))`; apply `sortTasks` to the TOP-LEVEL nodes only (keep sub-task order stable) — sort `nodes` before `.map`. In `/app` add `const [taskSort,setTaskSort]=useState<TaskSort>('due')` and a `<SortControl>` in the task filter row; pass down.

- [ ] **Step 8: `pnpm typecheck && pnpm test list-sort && pnpm build`** → pass.

- [ ] **Step 9: Commit** — named files only.

---

## Self-review

- **Spec coverage:** timestamps (T2) · phantom-Uncategorized fix (T1 query card + T3 money-card via resolver) · informative breakdown all-cats/%/count/week-month/income-net (T3) · filter+sort money (T4) + sort other 3 (T5) + breakdown→filter (T4). Device reconcile = post-merge owner step (below).
- **Placeholders:** none — pure cores + tests are full code; UI steps name exact files, anchors, props.
- **Type consistency:** `MoneyFilter`/`MoneySort`/`SpendRow`/`CategoryIdentity`/`DateSort`/`TaskSort` defined once and consumed as written; `computeMoneyBreakdown` signature unchanged (callers stay green).

## Post-merge (owner)

After deploy is green + prod `/app` 200: reconcile Sheik's device (fresh resync / clear PWA local data) so stale category ids clear; then re-query prod / confirm in-app that the phantom "Uncategorized" is gone and the breakdown shows % + counts. Optionally dedupe the live Bike ×3 / Groceries ×2 categories (separate cleanup).
