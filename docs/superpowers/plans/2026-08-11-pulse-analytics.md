# Spending Trends & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Chart tasks (2 & 3) MUST first load the `dataviz` skill and follow its method (form → color → **run the palette validator** → marks → hover → a11y → render-and-look).

**Goal:** A dedicated `/analytics` page — spend trend, income-vs-spend + net, top movers, and per-category small multiples — over the last N weeks/months, client-side over Dexie.

**Architecture:** Pure helpers in `src/lib` (unit-tested) compute the datasets from `useMoneyEntries` + the all-category resolver + FX; inline-SVG chart components render them per the dataviz method; a new authed page (mirroring `/insights`) composes them with a week/month toggle. No schema/sync/dependency changes; no chart library.

**Tech Stack:** Next 16 / React 19 / Tailwind 4 / Dexie / inline SVG / vitest.

## Global Constraints

- Client-only. NO schema/migration/sync-contract/entity_kind/cron/server changes; NO chart-library dependency (inline SVG, like the existing `Sparkline`/`WeeklyBars`).
- **Gate MUST be `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** — all green. ESLint `react-hooks/purity`: never `Date.now()` in render/useMemo — use `new Date().getTime()`.
- Reuse: `computeMoneySeries` (`@/lib/query-money-exec`), `makeCategoryResolver` (`@/lib/category-resolve`) + `useAllCategories`, `convertViaRates` (`@/lib/fx`), `currencySymbol` (`@/lib/currency`), `SUPPORTED_CURRENCIES` (`@/lib/op-schemas/money`), `useMoneyEntries`, `useUserPrefs`, `useFxRates`. Mirror `/insights` page shell (`src/app/insights/page.tsx`) for auth/layout.
- **dataviz non-negotiables:** form before color; NO dual-axis (income & spend share one $ axis); categorical hues assigned in FIXED order (never cycled), color follows the entity not its rank; legend present for ≥2 series; text in text tokens (never the series color); recessive grid/axes; per-mark hover; an accessible table/`aria` fallback; **run `scripts/validate_palette.js` — do not eyeball ΔE**; dark-glass surface is the default, validate both modes.
- `git add` only named files. git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Don't push (controller merges).
- Amounts minor units; ÷100 for display except JPY (÷1). FX via `convertViaRates` (fallback 0).
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/analytics` + `/app` 200.

## Reference (verbatim)

- `computeMoneySeries(entries: MoneyEntryRow[], opts: { from: string; to: string; bucket: 'day'|'week'|'month'; direction: 'out'|'in' }, toPrimary: (e: MoneyEntryRow) => number): { label: string; amount: number }[]` — UTC buckets, `from <= occurred_at < to`.
- `makeCategoryResolver(cats: {id;name;icon;kind}[]) => (id: string|null) => { name; icon; kind } | null`.
- `convertViaRates(amount, from, to, occurredAtIso, rates, overrides) => { amount; rateDate } | null`.
- Row: `MoneyEntryRow` = `{ id, amount, currency, direction:'out'|'in', category_id:string|null, occurred_at, deleted_at, … }`.

---

### Task 1: pure analytics helpers + tests

**Files:**
- Create: `src/lib/analytics.ts`, `src/lib/analytics.test.ts`

**Interfaces (Produces):**
- `type Period = { from: string; to: string; label: string }`
- `analyticsPeriods(nowMs: number, bucket: 'week'|'month', count: number): Period[]` — `count` contiguous UTC buckets, chronological, ending with the current period. week = Monday→next Monday; month = 1st→next 1st. `label`: `MMM d` (week start) / `MMM` (month), tz-agnostic UTC.
- `type Mover = { name: string; icon: string | null; current: number; previous: number; delta: number; deltaPct: number | null }`
- `computeTopMovers(current: MoneyEntryRow[], previous: MoneyEntryRow[], opts: { resolve: (id: string|null) => { name: string; icon: string|null } | null; toPrimary: (e: MoneyEntryRow) => number }): Mover[]` — spend (`out`) only, grouped by resolved identity (null → "Uncategorized"), `delta = current − previous`, `deltaPct = previous===0 ? null : delta/previous*100`, sorted by `|delta|` desc.
- `type CategorySeries = { name: string; icon: string | null; points: number[] }`
- `computeCategorySeries(entries: MoneyEntryRow[], opts: { periods: Period[]; resolve; toPrimary; topN: number }): CategorySeries[]` — spend only; each category's `points[i]` = spend in `periods[i]`; rank categories by total spend, keep `topN`, fold the rest into one `{ name: 'Other', icon: null }`; `points` length === `periods.length`.

- [ ] **Step 1: Failing tests** — `src/lib/analytics.test.ts` (use a `row()` factory like other lib tests; `toPrimary = e => e.amount`; a `resolve` mapping a couple ids → names):

```ts
// analyticsPeriods
it('returns N contiguous month buckets ending at the current month, with year rollover', () => {
  const now = Date.parse('2026-01-15T00:00:00Z')
  const p = analyticsPeriods(now, 'month', 3)
  expect(p.map(x => x.from)).toEqual(['2025-11-01T00:00:00.000Z','2025-12-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'])
  expect(p[2].to).toBe('2026-02-01T00:00:00.000Z')
})
it('returns N contiguous week buckets (Monday-aligned)', () => {
  const now = Date.parse('2026-08-13T00:00:00Z') // Thu
  const p = analyticsPeriods(now, 'week', 2)
  expect(p).toHaveLength(2)
  expect(new Date(p[1].from).getUTCDay()).toBe(1) // Monday
  expect(p[0].to).toBe(p[1].from)                 // contiguous
})
// computeTopMovers
it('computes delta + deltaPct and sorts by |delta|, resolving names', () => {
  const resolve = (id: string|null) => id === 'food' ? { name:'Food', icon:'🍴' } : id === 'rent' ? { name:'Rent', icon:'🏠' } : null
  const movers = computeTopMovers(
    [row({category_id:'food',amount:300}), row({category_id:'rent',amount:1000})],
    [row({category_id:'food',amount:100})],
    { resolve, toPrimary: e => e.amount },
  )
  expect(movers[0].name).toBe('Rent')            // |Δ|=1000 largest
  expect(movers.find(m=>m.name==='Food')).toMatchObject({ current:300, previous:100, delta:200, deltaPct:200 })
  expect(movers[0].deltaPct).toBeNull()          // previous 0
})
// computeCategorySeries
it('aligns per-category points to periods and folds beyond topN into Other', () => {
  const periods = analyticsPeriods(Date.parse('2026-02-15T00:00:00Z'), 'month', 2) // Jan, Feb
  const resolve = (id: string|null) => id ? { name:id, icon:null } : null
  const s = computeCategorySeries(
    [row({category_id:'a',amount:500,occurred_at:'2026-01-10T00:00:00Z'}), row({category_id:'b',amount:100,occurred_at:'2026-02-10T00:00:00Z'}), row({category_id:'c',amount:10,occurred_at:'2026-02-10T00:00:00Z'})],
    { periods, resolve, toPrimary: e => e.amount, topN: 2 },
  )
  expect(s.every(x => x.points.length === 2)).toBe(true)
  expect(s.map(x => x.name)).toContain('Other')  // 'c' folded
})
```

- [ ] **Step 2: Run, confirm fail.** **Step 3: Implement `src/lib/analytics.ts`** — `analyticsPeriods` via `Date.UTC` month/week math (reuse the pattern from `money-filter-sort.monthBounds`; week = align to Monday, step 7 days); `computeTopMovers` groups both period sets by `resolve(id)?.name ?? 'Uncategorized'`; `computeCategorySeries` buckets each entry into its period index (`occurred_at` in `[from,to)`) under its resolved name, totals to rank + fold Other. Pure, no mutation.

- [ ] **Step 4: Run tests → pass.** **Step 5: Gate** `pnpm lint && pnpm typecheck && pnpm test analytics`.
- [ ] **Step 6: Commit** — `git add src/lib/analytics.ts src/lib/analytics.test.ts && git commit -m "feat: pure analytics helpers (periods, top movers, category series)"`

---

### Task 2: validated chart palette + the two time-series charts

**REQUIRED: load the `dataviz` skill first and follow its method.**

**Files:**
- Create: `src/lib/chart-palette.ts`, `src/components/charts/bar-trend.tsx`, `src/components/charts/dual-series-trend.tsx`

**Interfaces (Produces):**
- `chart-palette.ts`: `SEQUENTIAL_HUE: string` (single-series magnitude — the app accent cyan `rgb(52 230 255)` is fine); `DIVERGING: { positive: string; negative: string; neutral: string }` (net/movers — positive=good, negative=critical, neutral gray); `CATEGORICAL: string[]` (fixed order, ≥6 entries) for small multiples. **Take the categorical order + diverging pair from the dataviz `references/palette.md` (already validated), then RUN `node <dataviz-base>/scripts/validate_palette.js "<comma-hexes>" --mode dark` (dark glass surface) AND `--mode light`; snap any FAIL to a passing step; record the passing report in the task report.**
- `<BarTrend data={{label:string;amount:number}[]} symbol:string jpy:boolean label:string />` — vertical bars, ONE series → `SEQUENTIAL_HUE`, no legend; baseline-anchored 4px-rounded bars; recessive baseline + a single max-value gridline/label; most-recent bar emphasized; per-bar hover `<title>` (`label` + formatted amount); `role="img"` + `aria-label`; a "show data" toggle rendering a `<table>` of label/amount. Empty/one-point → a muted "not enough data yet".
- `<DualSeriesTrend spend={{label;amount}[]} income={{label;amount}[]} symbol jpy />` — income & spend on ONE axis (grouped bars, 2px gap), a 2-series **legend** (spend vs income; distinct hues from the palette, NOT reusing a category hue), per-period **net** shown as a small strip below each period using `DIVERGING` (net≥0 positive hue, <0 negative, with a +/− sign label — never color-alone); per-mark hover; table fallback.

- [ ] **Step 1: Load `dataviz` skill.** **Step 2: Define + VALIDATE `chart-palette.ts`** (run the validator; record output).
- [ ] **Step 3: Implement `bar-trend.tsx`** per the mark specs; **Step 4: Implement `dual-series-trend.tsx`** (one axis, legend, net strip).
- [ ] **Step 5: Gate** `pnpm lint && pnpm typecheck && pnpm build`. Charts are presentational (no unit test) — verify compile + the validator pass. **Step 6: Commit** named files.

---

### Task 3: movers (diverging) + per-category small multiples

**REQUIRED: load the `dataviz` skill first.**

**Files:**
- Create: `src/components/charts/movers-bars.tsx`, `src/components/charts/category-small-multiples.tsx`

**Interfaces (Consumes Task 1 types + Task 2 palette):**
- `<MoversBars movers={Mover[]} symbol jpy limit?=8 />` — top `limit` by |delta| as **diverging horizontal bars** from a center zero (increase → `DIVERGING.negative`/right, decrease → `DIVERGING.positive`/left, or the reverse — pick one and label it: more-spend is the "up/worse" direction), each row: `↑/↓ {icon} {name}  {±amount} ({±pct%})`; bar length ∝ |delta| / max|delta|; arrow + sign so it's never color-alone; hover `<title>`; table fallback; empty → muted note.
- `<CategorySmallMultiples series={CategorySeries[]} periods={Period[]} symbol jpy />` — a responsive grid (2–3 cols) of mini bar charts, ONE per series; each titled `{icon} {name}` + its period total; bars use that series' CATEGORICAL hue assigned by **fixed index** (series[i] → CATEGORICAL[i mod n], "Other" → a neutral gray); shared y-scale across multiples OR per-chart (pick shared for comparability); per-bar hover; the grid is the legend (title on each). Wide grid scrolls its own container.

- [ ] **Step 1: Load `dataviz`.** **Step 2: `movers-bars.tsx`.** **Step 3: `category-small-multiples.tsx`.**
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm build`. **Step 5: Commit** named files.

---

### Task 4: `/analytics` page + Money-tab link

**Files:**
- Create: `src/app/analytics/page.tsx`
- Modify: `src/app/app/page.tsx` (add the link)

**Interfaces (Consumes all above):**
- Page mirrors `/insights` shell: `authClient.getSession()` → `router.replace('/login')` or `setUserId`; `AuroraBackground`; `<main className="mx-auto flex max-w-md flex-col gap-4 p-6">`; header with title + a **week/month** toggle (two 44px buttons) + a "← Back to Pulse" link.
- State: `bucket: 'week'|'month'` (default `'month'`); lookback `count` = `bucket==='week' ? 12 : 6`.
- Data: `useMoneyEntries(userId)` (all), `useAllCategories(userId)` → `resolve = makeCategoryResolver(...)`, `useUserPrefs`, `useFxRates([...SUPPORTED_CURRENCIES])`. `toPrimary` = same as money-card (`convertViaRates` fallback 0). Wrap clock reads for lint: `const nowMs = useMemo(() => new Date().getTime(), [])`.
- Compute (all in `useMemo`): `periods = analyticsPeriods(nowMs, bucket, count)`; `spendSeries = computeMoneySeries(entries, {from:periods[0].from, to:periods[periods.length-1].to, bucket, direction:'out'}, toPrimary)` (align labels to `periods`); `incomeSeries` likewise `direction:'in'`; movers = `computeTopMovers(entriesInCurrentPeriod, entriesInPreviousPeriod, {resolve, toPrimary})` (slice entries by the last two `periods`); `catSeries = computeCategorySeries(entries, {periods, resolve, toPrimary, topN:6})`.
- Render the four sections in order (each in a `glass rounded-2xl p-4` card with an uppercase muted section label): `<BarTrend>` (spend), `<DualSeriesTrend>` (income vs spend + net), `<MoversBars>`, `<CategorySmallMultiples>`. Empty-state per section when no data.
- **Money-tab link:** in `src/app/app/page.tsx`, add a small 44px "📈 Trends" link/button in the money tab (near the `MoneyCard`, inside the `activeTab === 'money'` block) → `router.push('/analytics')` (a Next `<Link href="/analytics">` is fine).

- [ ] **Step 1:** Build `src/app/analytics/page.tsx` (shell + state + memoized datasets + the four sections + empty states). **Step 2:** Add the Money-tab link. **Step 3:** Gate `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (full suite + build; build catches the new route's prerender). **Step 4:** Commit named files.

---

## Self-review

- **Spec coverage:** spend trend (T2 BarTrend) · income-vs-spend+net (T2 DualSeriesTrend) · top movers (T1 compute + T3 MoversBars) · per-category small multiples (T1 compute + T3 CategorySmallMultiples) · dedicated page + link (T4). Palette validated (T2). ✓
- **Placeholders:** none — T1 full code + tests; T2–T4 give exact component contracts, dataviz directives, and page wiring.
- **Type consistency:** `Period`/`Mover`/`CategorySeries` defined in T1, consumed verbatim in T3/T4; palette exports consumed in T2/T3; `computeMoneySeries` used with its real signature.

## Post-merge

Verify prod `/analytics` + `/app` 200; **render-and-look** at `/analytics` (screenshot/QA per the dataviz final step) for label collisions/overflow; confirm week/month toggle, hover tooltips, and the table fallbacks. Owner: open `/analytics` on-device once real multi-month data is present.
