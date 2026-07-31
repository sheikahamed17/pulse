# Money Trends (8-week bars in MoneyCard) — Design

**Date:** 2026-07-23
**Status:** Approved (design)
**Feature:** Fold an 8-week weekly-spend bar strip into `MoneyCard`, replacing its 7-day sparkline, to surface a longer spending trend.

## Goal

`MoneyCard` shows this-month spend + a 7-day sparkline. Replace the sparkline with an 8-week weekly-spend bar chart so the user sees a multi-week trend at a glance, in their primary currency (FX-converted). Presentational + one tested pure aggregation; no schema/sync change.

## Change

In `MoneyCard` (rendered in two places — the desktop `<aside>` and the mobile `md:hidden` slot on the Money tab):
- Remove the top-right 7-day `Sparkline` and its `sparklinePoints` `useMemo`.
- Add a full-width **8-week weekly-spend bar strip** (`WeeklyBars`) below the this-month number, captioned "Last 8 weeks".
- Keep unchanged: header "Spent · this month" + delta, the month total, top-3 categories (this month), FX footnote.
- The card now shows two clearly-labeled windows: *this month* (number, delta, categories) and the *8-week* history (bars).

## Units

### 1. `src/lib/weekly-spend.ts` (pure, tested)

```ts
import type { MoneyEntryRow } from '@/lib/dexie'
import { convertViaRates } from '@/lib/fx'
type Rate = { date: string; target: string; rate: number }

export function weeklySpendBars(
  entries: MoneyEntryRow[],
  primary: string,
  rates: Rate[],
  overrides: Record<string, number>,
  nowIso: string,
  weeks = 8,
): number[]
```

- Bucket **out**-entries into `weeks` rolling 7-day windows: `w = floor((now − occurred_at) / 7d)`; skip if `deleted_at`, `w < 0` (future), or `w >= weeks` (older than window). Bucket index `weeks − 1 − w` (so index 0 = oldest, last = current week).
- Convert to primary minor units: primary-currency entries added directly; else `convertViaRates(...)` — add `conv.amount` if non-null, skip if null (unconvertible).
- Returns `number[]` of length `weeks`, oldest→newest.

### 2. `WeeklyBars` (sub-component in `money-card.tsx`)

A compact bar chart of the 8 values (CSS-flex bars so it scales to its container — the 360px aside and full-width mobile): bar height ∝ value / max (min sliver when 0 or empty); the **current week (last bar) in accent-2**, the rest muted; a small "Last 8 weeks" caption; `aria-label` summarizing the range. Built after loading the `dataviz` skill (color/spacing/accessibility per its guidance) — its explicit trigger is "before writing chart code."

### 3. `MoneyCard` wiring

Add `const eightWeeks = useMemo(() => ({ from: <now−8×7d ISO>, to: <now ISO> }), [])` and `const trend = useMoneyEntries(userId, eightWeeks)`; compute `weeklySpendBars(trend, prefs.primary_currency, rates, prefs.fx_overrides ?? {}, new Date().toISOString())`; render `<WeeklyBars values={...} />` where the `Sparkline` was. Remove `Sparkline` + `sparklinePoints`.

## Data flow

`useMoneyEntries(8-week range)` + `rates` + `prefs` → `weeklySpendBars` → `<WeeklyBars>`. Same FX/primary pipeline already in MoneyCard. Pure client read; **no schema / sync / cron / dependency change**; Dexie v9.

## Error handling

`weeklySpendBars` is pure/total. Unconvertible-currency entries are skipped from the bars (the month FX footnote already flags skipped currencies). Zero entries → all-zero → flat min slivers. `max = Math.max(1, ...values)` guards divide-by-zero.

## Testing

**Unit (`tests/lib/weekly-spend.test.ts`):**
- Bucketing: a this-week entry → last bucket; a ~10-day-old entry → an earlier bucket; correct index mapping.
- Out-only: income (`direction: 'in'`) ignored.
- FX: a foreign-currency entry converted to primary and summed.
- Window: entry older than 8 weeks excluded; future entry excluded.
- Deleted excluded.
~6 cases.

`WeeklyBars` render + MoneyCard integration are QA-runbook-verified (`docs/superpowers/notes/2026-07-23-pulse-money-trends-qa-runbook.md`) — MoneyCard is presentational (untested today).

## Plan shape

~3 tasks: (1) pure `weekly-spend.ts` + tests; (2) load `dataviz` → `WeeklyBars` sub-component; (3) wire into MoneyCard (8-week fetch + replace sparkline) + QA runbook + gate. Opus review optional (mostly presentational + one tested pure fn); owner verifies the chart visually.

## Constraints (verbatim)

- No new dependency (inline CSS/SVG chart, like the existing Sparkline). No schema/sync/cron change. Dexie v9.
- Rolling 7-day buckets (not calendar weeks) — no tz/week-start math.
- `WeeklyBars` must scale to both the 360px aside and full-width mobile.
- Spend = out-direction only; primary-currency, FX-converted (unconvertible skipped).
- Load `dataviz` before writing the chart component.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED.
