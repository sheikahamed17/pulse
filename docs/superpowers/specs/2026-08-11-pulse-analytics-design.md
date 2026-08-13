# Pulse — Spending trends & analytics (design)

**Date:** 2026-08-11
**Status:** approved for planning

## Problem

Pulse can answer point questions ("what did I spend this month by category") and shows a single-period "Spent · this month" card, but there's no place to see **change over time** — is spending trending up or down, am I net positive, which categories are driving the change, how does each category move month to month. The data exists in Dexie; only a read/visualization layer is missing.

## Goals

A dedicated **`/analytics`** page (linked from the Money tab) with four sections, a **week/month** period toggle, and a lookback window (default: last 12 weeks / last 6 months):

1. **Spend trend** — total spend per period as a bar chart.
2. **Income vs spend + net** — both series over time (one axis) + a net (income − spend) indicator per period.
3. **Top movers** — the categories whose spend changed most vs the previous period (↑/↓ amount + %).
4. **Per-category trend** — small multiples: a mini bar chart per top category over the periods.

Client-only, over Dexie, reusing `computeMoneySeries`, FX conversion (`convertViaRates`), and the all-category resolver (`makeCategoryResolver` + `useAllCategories`).

## Non-goals (YAGNI)

- No schema/migration/sync-contract/entity_kind/cron changes; no server routes. Pure client read layer.
- **No charting-library dependency** — charts are inline SVG (matches the existing `Sparkline`/`WeeklyBars`).
- Not analytics for tasks/learning/notes (money only, this slice).
- No custom date-range picker beyond the week/month toggle + fixed lookback (revisit later).
- No export from this page (separate slice).

## Chart forms (per the dataviz method — form before color)

- **Spend trend** — magnitude over time → **vertical bars**, ONE series → sequential single hue, no legend, recessive axis, per-bar hover tooltip (period + amount). Most-recent bar emphasized.
- **Income vs spend + net** — two same-unit ($) series → **one axis** (NEVER dual-axis): grouped bars or two lines for income & spend with a 2-series **legend** + direct labels; **net** per period is polarity → a **diverging** treatment (positive = good hue, negative = critical hue, neutral-gray zero) shown as a small per-period net row/line.
- **Top movers** — polarity (increase/decrease) per category → **diverging horizontal bars** ranked by |Δ|, each labelled with category name + Δ amount + Δ% and an ↑/↓ (never color-alone).
- **Per-category trend** — many categories → **small multiples**: top ~6 spend categories, each a mini bar sparkline of its per-period spend, categorical hue assigned in FIXED order (never cycled); a 7th+ folds into "Other".

## Color & accessibility (dataviz non-negotiables)

- A small **validated** palette: (a) a sequential hue for the single-series trend; (b) a **diverging pair + neutral** for net/movers; (c) a fixed categorical order for the small multiples. Dark glassmorphism is the app's surface → **dark-mode-first**, and both light/dark steps are validated against their surface with `scripts/validate_palette.js` (run it — do not eyeball ΔE) before shipping.
- Color follows the **entity** (category), never its rank — a filter/period change must not repaint survivors.
- Text (values, labels, legends) wears text tokens (muted/foreground), never the series color; the colored mark carries identity.
- Every chart: recessive grid/axes; thin marks; 4px rounded bar ends on the baseline; ≥2px gaps; hover tooltip; and an **accessible fallback** (each chart is also a `<table>`-equivalent or has `aria-label`s / a "show data" table) so identity/values are never color-alone. Legend present whenever ≥2 series.

## Architecture

### Pure helpers (`src/lib`, unit-tested)

- **Reuse** `computeMoneySeries(entries, {from,to,bucket,direction}, toPrimary)` (exists in `query-money-exec.ts`) for the spend trend and the income series (call once per direction).
- **New `computeCategorySeries(entries, {periods, direction, resolve}, toPrimary)`** → for the top-N resolved categories, an array of `{ name; icon; points: number[] }` aligned to the same period buckets (for small multiples). Folds beyond top-N into "Other".
- **New `computeTopMovers(current, previous, {resolve, toPrimary})`** → per resolved category: `{ name; icon; current; previous; delta; deltaPct }`, sorted by |delta| desc. Reuses the same resolved-identity grouping as `computeSpendBreakdown`.
- **New `analyticsPeriods(nowMs, bucket, count)`** → the list of `{from,to,label}` buckets (UTC, matching `computeMoneySeries`/money-card bounds) for the lookback window.

### Components (`src/components`)

- Small inline-SVG chart primitives: a labelled **`<BarTrend>`** (single series + hover), a **`<DualSeriesTrend>`** (income vs spend, one axis, legend) with a **net strip**, a **`<MoversBars>`** (diverging horizontal), and **`<CategorySmallMultiples>`** (grid of mini bar charts). Reuse/adapt the existing `Sparkline` where it fits.
- Each chart: `role="img"` + `aria-label`, per-mark `<title>`/tooltip, and a toggle to reveal the underlying numbers as a table.

### Page & navigation

- **`src/app/analytics/page.tsx`** — an authed client page (same shell as `/insights`: `authClient.getSession` → redirect if unauthed; `AuroraBackground`; a header with a back-to-app link). Owns the `bucket: 'week'|'month'` toggle + lookback; loads money entries via `useMoneyEntries`, categories via `useAllCategories`, prefs + FX; computes the four datasets with the pure helpers; renders the four sections.
- **Link from the Money tab** — a small "Trends"/analytics affordance (icon+label, 44px) in the Money tab area (e.g., near the `MoneyCard`/header) → `router.push('/analytics')`.

## Data flow

```
/analytics: useMoneyEntries + useAllCategories + prefs + FX
  → analyticsPeriods(now, bucket, N)  [pure]
  → computeMoneySeries (spend) + computeMoneySeries (income)  [pure]
  → computeTopMovers(current, previous, …)  [pure]
  → computeCategorySeries(entries, {periods, top N}, …)  [pure]
  → <BarTrend> / <DualSeriesTrend + net> / <MoversBars> / <CategorySmallMultiples>
```

## Correctness invariants (tested)

1. **Period bucketing** matches `computeMoneySeries`/money-card bounds (UTC; `from <= occurred_at < to`); `analyticsPeriods` returns contiguous, chronologically-sorted buckets with correct year-boundary rollover.
2. **Top movers**: `delta = current − previous`; `deltaPct = null` when previous is 0; sorted by |delta| desc; categories resolved across ALL categories (archived/tombstoned included) and merged by name (no phantom "Uncategorized" split — consistent with the shipped breakdown fix).
3. **Category series**: each category's `points` align 1:1 with the period list; top-N by total spend; the rest fold into a single "Other"; sums reconcile with the spend trend totals.
4. **FX**: non-primary amounts converted via `convertViaRates` (fallback 0 on missing rate), consistent with money-card; JPY handled (÷1 vs ÷100 at display only).
5. **Client-only**: no op written; existing tests stay green.
6. **Palette**: `scripts/validate_palette.js` passes for the categorical set (adjacent-pair CVD ΔE ≥ 8) and the surfaces used, in BOTH modes, before ship.

## Testing

- **Pure:** `analyticsPeriods` (bucketing + year boundary), `computeTopMovers` (delta/deltaPct/sort/resolve-merge), `computeCategorySeries` (alignment, top-N + Other, reconciliation). Unit-tested.
- **Charts/page** are presentational → `pnpm lint` + `pnpm typecheck` + `pnpm build` + a QA runbook (toggle week/month; hover tooltips; the table fallback; empty-state with no data); plus the **palette validator** run.
- Full **gate**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green; **opus whole-branch review**; **render-and-look** at the page (screenshot/QA) for label collisions/overflow per the dataviz final step.

## Global constraints

- Client-only; no schema/migration/sync/entity_kind/dependency/cron/server changes. Inline SVG charts (no chart lib).
- **Gate MUST include `pnpm lint`** (Deploy runs Lint before `wrangler deploy`). ESLint `react-hooks/purity`: no `Date.now()` in render/useMemo — use `new Date().getTime()`.
- Reuse `computeMoneySeries`, `makeCategoryResolver`/`useAllCategories`, `convertViaRates`, `currencySymbol`, `SUPPORTED_CURRENCIES`, `useMoneyEntries`, `useUserPrefs`, `useFxRates`; mirror the `/insights` page shell for auth/layout.
- Follow the **dataviz** method: form → color → **validate palette (run the script)** → marks → hover → a11y → render-and-look; check against `anti-patterns.md`. No dual-axis; categorical hues fixed-order; legend for ≥2 series; text in text tokens.
- Theme-aware (dark-first glassmorphism); charts responsive (wide content scrolls its own container, page never scrolls sideways).
- Merging to `main` auto-deploys; verify CI + Deploy green + prod `/analytics` + `/app` 200 after.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; `git add` only named files.
