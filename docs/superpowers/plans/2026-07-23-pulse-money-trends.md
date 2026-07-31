# Money Trends (8-week bars in MoneyCard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MoneyCard's 7-day sparkline with an 8-week weekly-spend bar strip.

**Architecture:** A pure `weeklySpendBars` (rolling 7-day buckets, FX-converted) + a `WeeklyBars` CSS-flex chart sub-component + a MoneyCard rewire (add an 8-week fetch, drop the sparkline).

**Tech Stack:** React 19, TypeScript, Tailwind 4, Dexie v9, Vitest. Inline CSS chart (no new deps).

**Spec:** `docs/superpowers/specs/2026-07-23-pulse-money-trends-design.md`

## Global Constraints

- No new dependency (inline chart, like the existing Sparkline). No schema/sync/cron change. Dexie v9.
- Rolling 7-day buckets (not calendar weeks). Spend = out-direction only; primary-currency, FX-converted (unconvertible skipped). `WeeklyBars` scales to the 360px aside + full-width mobile.
- **Load the `dataviz` skill before writing `WeeklyBars`** (Task 2).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — separate; lint 0 errors).

## File Structure

- Create: `src/lib/weekly-spend.ts`, `tests/lib/weekly-spend.test.ts`, `docs/superpowers/notes/2026-07-23-pulse-money-trends-qa-runbook.md`.
- Modify: `src/components/money-card.tsx` (add `WeeklyBars` + 8-week fetch; remove `Sparkline` + `sparklinePoints`).

---

### Task 1: Pure `weekly-spend.ts`

**Files:**
- Create: `src/lib/weekly-spend.ts`
- Test: `tests/lib/weekly-spend.test.ts`

**Interfaces:**
- Consumes: `convertViaRates` from `@/lib/fx`; `MoneyEntryRow` from `@/lib/dexie`.
- Produces: `weeklySpendBars(entries, primary, rates, overrides, nowIso, weeks?): number[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/weekly-spend.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { weeklySpendBars } from '@/lib/weekly-spend'
import type { MoneyEntryRow } from '@/lib/dexie'

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-07-23T12:00:00.000Z'
const e = (over: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'x', user_id: 'u', amount: 0, currency: 'INR', direction: 'out', category_id: null,
  description: null, occurred_at: NOW, source: 'manual', receipt_key: null, raw_input: null,
  recurring_rule_id: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over,
} as any)

function bars(entries: MoneyEntryRow[]) {
  return weeklySpendBars(entries, 'INR', [], {}, NOW)
}

describe('weeklySpendBars', () => {
  it('buckets this-week and ~10-day-old into the right indices', () => {
    const b = bars([
      e({ amount: 5000, occurred_at: '2026-07-23T00:00:00.000Z' }), // ~12h old → current week (last)
      e({ amount: 3000, occurred_at: '2026-07-13T12:00:00.000Z' }), // 10 days old → w=1 → index 6
    ])
    expect(b).toHaveLength(8)
    expect(b[7]).toBe(5000)
    expect(b[6]).toBe(3000)
    expect(b.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('ignores income (direction in)', () => {
    const b = bars([e({ amount: 9000, direction: 'in', occurred_at: NOW })])
    expect(b[7]).toBe(0)
  })

  it('excludes entries older than the window or in the future, and deleted', () => {
    const b = bars([
      e({ amount: 1000, occurred_at: '2026-05-01T00:00:00.000Z' }), // >8 weeks → excluded
      e({ amount: 2000, occurred_at: '2026-08-01T00:00:00.000Z' }), // future → excluded
      e({ amount: 4000, occurred_at: NOW, deleted_at: '2026-07-23T13:00:00.000Z' }), // deleted → excluded
    ])
    expect(b).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('skips a foreign-currency entry with no FX rate available', () => {
    const b = bars([e({ amount: 5000, currency: 'USD', occurred_at: NOW })])
    expect(b[7]).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/lib/weekly-spend.test.ts`
Expected: FAIL — cannot resolve `@/lib/weekly-spend`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/weekly-spend.ts`:

```ts
import type { MoneyEntryRow } from '@/lib/dexie'
import { convertViaRates } from '@/lib/fx'

type Rate = { date: string; target: string; rate: number }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Total spend (out-direction) per rolling 7-day window over the last `weeks`,
 * in the primary currency's minor units. Returns oldest→newest (index 0 = oldest,
 * last = current week). Non-primary entries are FX-converted; unconvertible ones
 * are skipped; income / deleted / future / older-than-window are excluded.
 */
export function weeklySpendBars(
  entries: MoneyEntryRow[],
  primary: string,
  rates: Rate[],
  overrides: Record<string, number>,
  nowIso: string,
  weeks = 8,
): number[] {
  const now = Date.parse(nowIso)
  const buckets = new Array<number>(weeks).fill(0)
  for (const e of entries) {
    if (e.direction !== 'out' || e.deleted_at) continue
    const age = now - Date.parse(e.occurred_at)
    if (age < 0) continue
    const w = Math.floor(age / WEEK_MS)
    if (w >= weeks) continue
    let amount: number
    if (e.currency === primary) {
      amount = e.amount
    } else {
      const conv = convertViaRates(e.amount, e.currency, primary, e.occurred_at, rates, overrides)
      if (!conv) continue
      amount = conv.amount
    }
    buckets[weeks - 1 - w] += amount
  }
  return buckets
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/lib/weekly-spend.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/weekly-spend.ts tests/lib/weekly-spend.test.ts
git commit -m "feat(trends): pure weeklySpendBars (rolling 7-day buckets)"
```

---

### Task 2: `WeeklyBars` sub-component (load dataviz first)

**Files:**
- Modify: `src/components/money-card.tsx` (add the `WeeklyBars` function)

- [ ] **Step 1: Load the `dataviz` skill**

Invoke the `dataviz` skill (its trigger: before writing any chart code) and apply its color/spacing/accessibility guidance to `WeeklyBars`. Swap the placeholder palette below for the skill's validated defaults where relevant; keep the app's `--accent-2` for the emphasized (current-week) bar to stay on-brand.

- [ ] **Step 2: Add the `WeeklyBars` component**

In `src/components/money-card.tsx`, add alongside the existing `Sparkline` function (which will be removed in Task 3):

```tsx
function WeeklyBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-12 items-end gap-1" role="img" aria-label={`Weekly spend, last ${values.length} weeks`}>
        {values.map((v, i) => {
          const isCurrent = i === values.length - 1
          const pct = v > 0 ? Math.max(6, (v / max) * 100) : 2
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${isCurrent ? 'bg-accent-2' : 'bg-white/15'}`}
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>
      <span className="text-[10px] text-muted-foreground">Last {values.length} weeks</span>
    </div>
  )
}
```

(Refine visuals per the `dataviz` skill — e.g. bar gap/rounding/empty-state sliver, and confirm `bg-accent-2` contrast in dark theme.)

- [ ] **Step 3: Verify it compiles (WeeklyBars is used in Task 3)**

Run: `pnpm typecheck` — note `WeeklyBars` may report as unused until Task 3 wires it; that resolves in Task 3. (Tasks 2 and 3 are executed back-to-back; run the full gate at the end of Task 3.)

---

### Task 3: Wire into MoneyCard (fetch + replace sparkline) + QA runbook

**Files:**
- Modify: `src/components/money-card.tsx`
- Create: `docs/superpowers/notes/2026-07-23-pulse-money-trends-qa-runbook.md`

- [ ] **Step 1: Import `weeklySpendBars`**

In `src/components/money-card.tsx`, add:
```ts
import { weeklySpendBars } from '@/lib/weekly-spend'
```

- [ ] **Step 2: Add the 8-week fetch + bars memo**

After the existing `const previous = useMoneyEntries(userId, prevRange)` line, add:
```tsx
  const eightWeeks = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 8 * 7 * 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [])
  const trend = useMoneyEntries(userId, eightWeeks)
  const weeklyBars = useMemo(
    () => weeklySpendBars(trend, prefs.primary_currency, rates, prefs.fx_overrides ?? {}, new Date().toISOString()),
    [trend, prefs.primary_currency, rates, prefs.fx_overrides],
  )
```

- [ ] **Step 3: Remove the `sparklinePoints` memo**

Delete the entire `const sparklinePoints = useMemo(() => { … }, [current, prefs.primary_currency, rates, range.to])` block.

- [ ] **Step 4: Replace the sparkline render with the bars**

Change the number/sparkline row:
```tsx
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[38px] font-semibold font-mono tabular-nums leading-tight" style={{
            textShadow: '0 0 20px rgb(52 230 255 / 0.4), 0 0 40px rgb(52 230 255 / 0.2)'
          }}>
            <span className="text-accent-2">{currencySymbol(prefs.primary_currency)}</span>
            {(primarySpend / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        {sparklinePoints.length > 0 && (
          <Sparkline points={sparklinePoints} width={80} height={48} />
        )}
      </div>
```
to (number on its own, bars full-width below):
```tsx
      <div>
        <div className="text-[38px] font-semibold font-mono tabular-nums leading-tight" style={{
          textShadow: '0 0 20px rgb(52 230 255 / 0.4), 0 0 40px rgb(52 230 255 / 0.2)'
        }}>
          <span className="text-accent-2">{currencySymbol(prefs.primary_currency)}</span>
          {(primarySpend / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>

      <WeeklyBars values={weeklyBars} />
```

- [ ] **Step 5: Remove the now-unused `Sparkline` function**

Delete the entire `function Sparkline({ points, width = 80, height = 48 }: …) { … }` definition (it is no longer referenced).

- [ ] **Step 6: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-23-pulse-money-trends-qa-runbook.md`:

```markdown
# Money Trends — QA Runbook (on-device)

1. Money tab → MoneyCard shows the this-month total, then a row of 8 weekly bars captioned "Last 8 weeks" (the old 7-day sparkline is gone).
2. The rightmost bar (current week) is accent-colored; earlier weeks are muted; bar heights scale to the tallest week.
3. Weeks with no spend show a thin sliver (not empty/broken).
4. Spend in a non-primary currency is included (FX-converted) — a foreign entry raises its week's bar; an unconvertible one is silently omitted (already noted in the FX footnote).
5. Renders correctly in BOTH the desktop right sidebar (~360px) and the mobile money view (full width).
6. Income (money in) does not affect the bars (spend only).
```

- [ ] **Step 7: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors (no unused `Sparkline`/`sparklinePoints` left); tests pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/money-card.tsx docs/superpowers/notes/2026-07-23-pulse-money-trends-qa-runbook.md
git commit -m "feat(trends): 8-week bars in MoneyCard (replaces 7-day sparkline) + QA runbook"
```

---

## Post-implementation

- Optional opus review (mostly presentational + one tested pure fn). Merge to `main` (auto-deploys); no D1 migration. Verify CI + Deploy both `success` + prod HTTP 200.
- Owner verification (I can't render): on-device, confirm the bars render well in both the aside and mobile, and read as a sensible trend.
