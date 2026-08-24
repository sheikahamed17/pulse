# Spending-anomaly insights — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Automatically flag categories where the user is spending unusually this month vs their own trailing norm ("Dining ₹4,200 this month — 180% above your ₹1,500 average"), surfaced live in `/analytics`. No config, no setup, no push — pure in-app intelligence over data they already have.

**Architecture:** A PURE detector over the per-category monthly series that `/analytics` already computes via `computeCategorySeries` (returns `{ name, icon, points: number[] }` — spend per period bucket). Anomaly = last bucket (this month) significantly above the average of the prior buckets. Rendered as a new "Watch-outs" section on `/analytics`. No migration, no entity, no cron, no push, no sync change.

## Design decisions (resolved)

- **Detector over `CategorySeries[]`** (reuse the page's existing computation — month buckets). For each category: `current = points[last]`, `baseline = avg(points[0..last-1])`. Flag when `baseline > 0 && current >= baseline * FACTOR && (current - baseline) >= MIN_DELTA`. `FACTOR = 1.5`, `MIN_DELTA = 50000` (₹500 in minor units — a meaningful-absolute-change floor to kill noise; single minor-unit floor is fine v1).
- **`baseline > 0` required** → we only flag a *spike vs an established norm*, not brand-new categories (avoids noise; new-category "first spend" is not an anomaly). Sort flagged by absolute delta desc; cap at top 5.
- **Live client-side on `/analytics`** (not the weekly digest / not push) → immediate, dependency-free, updates as data changes.
- **Deferred:** new-category alerts; income anomalies; per-category custom thresholds; a push/notification version; a dashboard widget; currency-aware MIN_DELTA.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green. No `Date.now()` in render/useMemo (`/analytics` already has a memoized `nowMs`).
- Client-only pure read layer; NO migration/entity/sync/cron/push change. Reuse `computeCategorySeries`/`CategorySeries`/`analyticsPeriods` (`@/lib/analytics`), and the `/analytics` page's existing `resolve` (makeCategoryResolver over useAllCategories), money `toPrimary`, memoized `nowMs`, `currencySymbol`.
- Amounts minor units (÷100 display, JPY÷1).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/analytics` + `/app` 200. **Whole-branch review** (light — pure read layer): confirm the math, the noise guards, empty state, and that `/analytics`'s existing sections are untouched.

## Background (verified)

- `computeCategorySeries(entries, { periods, resolve, toPrimary, topN }): CategorySeries[]` — `CategorySeries = { name: string; icon: string | null; points: number[] }`, `points` aligned to `periods` (chronological), spend (direction 'out') per bucket, in primary currency (via toPrimary). `topN` caps how many categories returned (by total).
- `/analytics` page already builds: `resolve` (category resolver), `toPrimary` (entry→primary), memoized `nowMs`, `analyticsPeriods`. It renders sections (Net worth, Spend, Income vs Spend, Movers, Category small-multiples). Add a new section.

---

### Task 1: pure `detectSpendingAnomalies`

**Files:** Create `src/lib/spending-anomaly.ts`, `src/lib/spending-anomaly.test.ts`

**Interfaces (Produces):**
- `type SpendingAnomaly = { name: string; icon: string | null; current: number; baseline: number; pct: number }`
- `const ANOMALY_FACTOR = 1.5`, `const ANOMALY_MIN_DELTA = 50000` (exported).
- `detectSpendingAnomalies(series: CategorySeries[], factor?: number, minDelta?: number): SpendingAnomaly[]` (defaults from the consts) — for each series with `points.length >= 2`: `current = points[points.length-1]`; `baseline = (sum of points[0..last-1]) / (points.length-1)`; if `baseline > 0 && current >= baseline*factor && (current - baseline) >= minDelta` → push `{ name, icon, current, baseline, pct: Math.round((current-baseline)/baseline*100) }`. Sort by `(current - baseline)` desc; return top 5. Pure; no mutation. Import `CategorySeries` from `@/lib/analytics`.

- [ ] **Step 1: Failing tests** `spending-anomaly.test.ts`:
  - a category `points: [100000, 100000, 300000]` (baseline 100000, current 300000, 3x) with default factor/minDelta → flagged, `pct: 200`, current/baseline correct.
  - a category just under factor (`[100000,100000,140000]`, 1.4x) → NOT flagged.
  - a category over factor but under MIN_DELTA (`[10000, 10000, 20000]` → delta 10000 < 50000) → NOT flagged.
  - `baseline 0` (`[0,0,80000]`) → NOT flagged (new spending, not an anomaly).
  - `points.length < 2` → skipped.
  - multiple anomalies → sorted by absolute delta desc, capped at 5.
  - empty input → `[]`.
- [ ] **Step 2: Run fail → implement `spending-anomaly.ts`** → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test spending-anomaly` → pass. **Step 4: Commit** named files.

---

### Task 2: `/analytics` "Watch-outs" section

**Files:** Modify `src/app/analytics/page.tsx`

- [ ] **Step 1:** In `/analytics`, add a memoized anomaly computation using MONTH buckets (independent of the week/month period toggle so the watch-out is stable):
```ts
const anomalies = useMemo(() => {
  const monthPeriods = analyticsPeriods(nowMs, 'month', 4)
  const series = computeCategorySeries(
    entries.filter(e => !e.deleted_at),
    { periods: monthPeriods, resolve, toPrimary, topN: 50 },
  )
  return detectSpendingAnomalies(series)
}, [entries, nowMs, resolve, toPrimary])
```
  (Import `detectSpendingAnomalies` from `@/lib/spending-anomaly`; `computeCategorySeries`/`analyticsPeriods` are already imported.)
- [ ] **Step 2:** Render a new section card near the TOP of `/analytics` (a watch-out belongs high), matching the existing section styling (`glass rounded-2xl p-4` + an uppercase muted label "Unusual spending"):
  - When `anomalies.length > 0`: a list, each row = `{icon} {name}` + a line `{symbol}{current÷100|JPY÷1} this month · {pct}% above your {symbol}{baseline} average`. Use `currencySymbol(prefs.primary_currency)` + the ÷100/JPY÷1 divisor already used elsewhere on the page. Give the delta a subtle rose/amber accent (it's a watch-out) using the page's existing token classes.
  - When `anomalies.length === 0`: a muted "No unusual spending this month — you're tracking to your norm." (Keep it reassuring, not empty.)
  - Guard: if there's essentially no history (all categories `points.length < 2`), the detector returns `[]` → the reassuring empty state shows (fine).
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /analytics). **Step 4: Commit** named file.

## Self-review

- **Coverage:** pure spike-vs-baseline detector with noise guards (T1) · live "Watch-outs" section + reassuring empty state on /analytics (T2). New-category/income/push/widget variants deferred. ✓
- **Placeholders:** none — detector signature + thresholds + test cases explicit; page wiring reuses named existing helpers.
- **Type consistency:** `SpendingAnomaly`/`detectSpendingAnomalies` (T1) consumed by the page (T2); reuses `CategorySeries`/`computeCategorySeries`/`analyticsPeriods`.
- **Guards:** baseline>0 + factor + MIN_DELTA kill false positives; <2 points skipped; empty → reassuring message; existing /analytics sections untouched.

## Post-merge

Verify prod `/analytics` + `/app` 200. This works on the user's existing money history immediately (no setup) — the more months of data, the sharper the baseline. Owner: open `/analytics` → the "Unusual spending" section flags any category spiking vs your norm.
