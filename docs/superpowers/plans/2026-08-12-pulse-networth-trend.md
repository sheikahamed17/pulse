# Net-worth over time — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Task 2 (chart) MUST load the `dataviz` skill first. Steps use `- [ ]`.

**Goal:** A trend of net worth across recent months, as a new section on `/analytics`. Reconstructs historical net worth by anchoring to today's known net worth and rolling back entries.

**Architecture:** PURE client read layer over accounts + money entries (no migration/entity/sync change). Extend `src/lib/accounts.ts` with `netWorthSeries`; add an inline-SVG line chart (net worth can be NEGATIVE → line with a zero baseline, not the existing non-negative bars); render a "Net worth" section on `/analytics`.

## The reconstruction model (review — it's the crux)

Net worth NOW is known (the accounts widget's value). An entry's effect on **net worth** is **direction-based regardless of account type**:
- asset `in` → +amt (assets up); asset `out` → −amt.
- liability `out` (card spend) → owed up → net worth −amt; liability `in` (credit) → owed down → net worth +amt.
- **⇒ for ANY assigned entry: `in` → +amt, `out` → −amt to net worth.**

So net worth at the END of a past month `t` = `currentNet − Σ(net-worth effect of entries that occurred AT/AFTER t)`, counting only entries assigned to an **active** account (matching what `netWorth()` sums — archived/unassigned excluded). This is anchored to the accurate present and rolls back known transactions → handles back-dated entries + opening balances cleanly. (Imperfections, acceptable v1: a recently-created account's opening balance is treated as present through the whole window; incomplete debt-payment logging is a transfers-gap, not a series bug. Single-currency (INR) is exact; cross-currency uses the same FX fallback as money-card.)

## v1 scope + non-goals

- v1 = a line chart of net worth per month over the last **6 months** + the current value, on `/analytics`.
- **Deferred:** a dashboard widget version (reuse the chart later); weekly granularity; per-account stacked breakdown; net-worth *projection* forward.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (`new Date().getTime()` in a memo).
- Client-only; NO migration/entity/sync change. Reuse `analyticsPeriods` (`src/lib/analytics.ts`), `netWorth`/`AccountLike` (`src/lib/accounts.ts`), `useAccounts` + `useMoneyEntries` + `useUserPrefs` + `useFxRates`, `convertViaRates`, `currencySymbol`, the dataviz palette (`src/lib/chart-palette.ts`).
- dataviz (Task 2): form→color→**run the palette validator if adding hues**→marks→a11y; net worth line needs a **zero baseline** + handle negatives; recessive axes; hover; a table fallback; theme-aware.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/analytics` + `/app` 200.

## Background (verified)

- `analyticsPeriods(nowMs, 'month', 6): { from, to, label }[]` (chronological, UTC month bounds, last = current month).
- `netWorth(accounts: AccountLike[], entries, toAcct, toPrimary): { net, assets, liabilities, perAccount }` — `net` is the current net worth (active accounts only).
- `/analytics` page (`src/app/analytics/page.tsx`) already loads `useMoneyEntries`, `useAllCategories`, prefs, FX, and builds a `toPrimary`; renders sections (BarTrend, DualSeriesTrend, MoversBars, CategorySmallMultiples). Chart components live in `src/components/charts/`. Chart palette in `src/lib/chart-palette.ts` (SEQUENTIAL_HUE, DIVERGING, etc.).

---

### Task 1: pure `netWorthSeries`

**Files:** Modify `src/lib/accounts.ts`; Test `src/lib/accounts.test.ts` (extend)

**Interfaces (Produces):**
- `type NetWorthPoint = { label: string; net: number }`
- `netWorthSeries(currentNet: number, entries: MoneyEntryRow[], activeAccountIds: Set<string>, periods: { from: string; to: string; label: string }[], toPrimary: (e: MoneyEntryRow) => number): NetWorthPoint[]` — for each period P (chronological), `net = currentNet − rollback(P.to)` where `rollback(t) = Σ over entries e with (e.account_id && activeAccountIds.has(e.account_id) && !e.deleted_at && e.occurred_at >= t) of (e.direction === 'in' ? +toPrimary(e) : −toPrimary(e))`. Return one point per period, in the periods' order. Pure; no mutation.

- [ ] **Step 1: Failing tests** (extend `accounts.test.ts`; reuse its money `row()` factory; `toPrimary = e => e.amount`):
  - Given currentNet=100000, active account 'a', and entries: an 'out' 20000 occurred in the CURRENT month, an 'in' 50000 occurred LAST month → the previous-month point rolls back the current-month 'out' (net = 100000 − (−20000) = 120000 at end of last month), the current-month point = 100000 (nothing after current month's end). Assert points align to periods + the rollback math.
  - entries on an INACTIVE/unassigned account (account_id not in the set / null) are ignored.
  - the LAST period's point === currentNet (no entries after the current month's end).
  - empty entries → every point === currentNet (flat line).
- [ ] **Step 2: Run fail → implement `netWorthSeries` in `accounts.ts`** → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test accounts` → pass. **Step 4: Commit** named files.

---

### Task 2: net-worth line chart (dataviz)

**REQUIRED: load the `dataviz` skill first.**

**Files:** Create `src/components/charts/net-worth-line.tsx`

**Interfaces (Produces):**
- `<NetWorthLine data={{ label: string; net: number }[]} symbol: string jpy: boolean />` — an inline-SVG **line** chart of `net` over `label`:
  - Handle NEGATIVE values: y-scale spans `[min(0, min net), max(0, max net)]`; draw a recessive **zero baseline** gridline when the range crosses zero.
  - Line stroke = `SEQUENTIAL_HUE` (or an accent from `chart-palette.ts`); 2px; emphasized last point (a ≥8px marker); optional subtle area to the zero line.
  - Recessive axis: a min/max value label + the zero line; x labels = the month labels (thinned if crowded).
  - Per-point hover `<title>` (label + formatted net, primary `symbol`, ÷100 or JPY÷1); `role="img"` + `aria-label`; a "Show data" `<table>` toggle (label/net).
  - ≤1 point → a muted "Not enough history yet".
  - Theme-aware (dark-first); responsive (scroll its own container if wide).

- [ ] **Step 1: Load `dataviz`.** **Step 2: Implement `net-worth-line.tsx`** per the mark/color/a11y specs (reuse `chart-palette.ts` hues — if you introduce a NEW hex, run the validator; reusing an existing validated hue needs no re-run). **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm build` (presentational). **Step 4: Commit** named file.

---

### Task 3: `/analytics` "Net worth" section

**Files:** Modify `src/app/analytics/page.tsx`

- [ ] **Step 1:** In `/analytics`, add `useAccounts(userId)` (+ it already has entries/prefs/FX). Build:
  - `accts = useAccounts(userId)` mapped to `AccountLike[]`; `activeAccountIds = new Set(accts.map(a => a.id))`.
  - `toAcct(e)` (entry→account currency) + `toPrimaryForNet(bal, cur)` (account→primary) mirroring the accounts widget, and an entry→primary `toPrimaryEntry(e)` for the series (mirror the page's existing money `toPrimary`).
  - `currentNet = netWorth(accts, entries, toAcct, toPrimaryForNet).net` (memoized).
  - `series = netWorthSeries(currentNet, entries, activeAccountIds, analyticsPeriods(nowMs,'month',6), toPrimaryEntry)` (memoized; `nowMs` is the page's existing memoized clock).
  - Render a new section card (uppercase muted "Net worth" label) with `<NetWorthLine data={series} symbol={currencySymbol(prefs.primary_currency)} jpy={prefs.primary_currency==='JPY'} />`. Place it near the top of `/analytics` (net worth is a headline measure) or after the spend trend — pick a sensible order.
  - Empty state: when `accts.length === 0`, show a muted "Add accounts (Settings → Accounts) to see net worth over time" instead of the chart.
- [ ] **Step 2: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (full suite + build; build prerenders /analytics). **Step 3: Commit** named file.

## Self-review

- **Coverage:** reconstruction math (T1 pure) · negative-capable line chart (T2 dataviz) · /analytics section + empty state (T3). ✓
- **Placeholders:** none — series signature + rollback formula + test cases explicit; chart contract + page wiring named.
- **Type consistency:** `NetWorthPoint`/`netWorthSeries` (T1) → `NetWorthLine` (T2) → page (T3); reuses `AccountLike`/`netWorth`/`analyticsPeriods`.
- **Guards:** unassigned/inactive-account entries excluded (consistent with `netWorth`); ≤1 point → chart empty note; no-accounts → section empty state; FX fallback mirrors money-card.

## Post-merge

Verify prod `/analytics` + `/app` 200. Owner: set up accounts + assign entries (esp. back-dated history) → `/analytics` shows net worth trending over the last 6 months. (Sparse/flat until accounts + entries exist.)
