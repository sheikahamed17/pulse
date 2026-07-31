'use client'

import { useMemo } from 'react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { convertViaRates } from '@/lib/fx'
import { weeklySpendBars } from '@/lib/weekly-spend'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

type Props = { userId: string }

type PeriodKind = 'week' | 'month'

export function MoneyCard({ userId }: Props) {
  const period: PeriodKind = 'month'   // Phase 1 default; Phase 2 lets user toggle
  const range = useMemo(() => currentPeriodRange(period), [period])
  const prevRange = useMemo(() => previousPeriodRange(period, range), [period, range])

  const current = useMoneyEntries(userId, range)
  const previous = useMoneyEntries(userId, prevRange)
  const eightWeeks = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 8 * 7 * 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [])
  const trend = useMoneyEntries(userId, eightWeeks)
  const categories = useCategories(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const catName = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  // Aggregate currentSpend in primary currency
  let primarySpend = 0
  let conversionApplied = false
  let conversionDate: string | null = null
  const skippedCurrencies = new Set<string>()
  for (const e of current) {
    if (e.direction !== 'out') continue
    if (e.currency === prefs.primary_currency) {
      primarySpend += e.amount
    } else {
      const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
      if (conv) {
        primarySpend += conv.amount
        conversionApplied = true
        if (!conversionDate || conv.rateDate < conversionDate) conversionDate = conv.rateDate
      } else {
        skippedCurrencies.add(e.currency)
      }
    }
  }

  // Similarly for previousSpend
  let previousPrimary = 0
  for (const e of previous) {
    if (e.direction !== 'out') continue
    if (e.currency === prefs.primary_currency) {
      previousPrimary += e.amount
    } else {
      const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
      if (conv) previousPrimary += conv.amount
    }
  }

  const delta = previousPrimary === 0 ? null : ((primarySpend - previousPrimary) / previousPrimary) * 100

  const topCategories = useMemo(() => topNByCategoryWithConversion(current, catName, prefs.primary_currency, rates, prefs.fx_overrides ?? {}, 3), [current, catName, prefs.primary_currency, rates, prefs.fx_overrides])
  const topMax = Math.max(1, ...topCategories.map(([, amt]) => amt))

  const weeklyBars = useMemo(
    () => weeklySpendBars(trend, prefs.primary_currency, rates, prefs.fx_overrides ?? {}, new Date().toISOString()),
    [trend, prefs.primary_currency, rates, prefs.fx_overrides],
  )

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-4">
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Spent · this month</span>
        {delta !== null && (
          <span className={`text-xs font-medium font-mono ${delta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(0)}% vs last
          </span>
        )}
      </header>

      <div>
        <div className="text-[38px] font-semibold font-mono tabular-nums leading-tight" style={{
          textShadow: '0 0 20px rgb(52 230 255 / 0.4), 0 0 40px rgb(52 230 255 / 0.2)'
        }}>
          <span className="text-accent-2">{currencySymbol(prefs.primary_currency)}</span>
          {(primarySpend / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>

      <WeeklyBars values={weeklyBars} symbol={currencySymbol(prefs.primary_currency)} jpy={prefs.primary_currency === 'JPY'} />

      <ul className="flex flex-col gap-1.5">
        {topCategories.length === 0 && (
          <li className="text-xs text-muted-foreground">No entries yet this {period}.</li>
        )}
        {topCategories.map(([cat, amt]) => (
          <li key={cat?.id ?? 'uncat'} className="flex items-center gap-2 text-xs">
            <span className="w-20 truncate">{cat?.icon ?? ''} {cat?.name ?? 'Uncategorized'}</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 bg-foreground/70"
                style={{ width: `${(amt / topMax) * 100}%` }}
              />
            </div>
            <span className="font-mono tabular-nums">{currencySymbol(prefs.primary_currency)}{(amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(0)}</span>
          </li>
        ))}
      </ul>

      {(conversionApplied || skippedCurrencies.size > 0) && (
        <p className="border-t border-white/10 pt-2 text-[10px] text-muted-foreground">
          {conversionApplied && conversionDate && (
            <>Includes conversion via ECB {conversionDate}. </>
          )}
          {skippedCurrencies.size > 0 && (
            <>Excluded {[...skippedCurrencies].join(', ')} (no FX rate yet).</>
          )}
        </p>
      )}
    </section>
  )
}

// Single-series magnitude-over-time bars (last N weekly spend totals). Current
// week emphasized in accent, prior weeks recessive; per-bar native title is the
// hover layer + accessibility. Single series → no legend (the caption names it).
function WeeklyBars({ values, symbol, jpy }: { values: number[]; symbol: string; jpy: boolean }) {
  const max = Math.max(1, ...values)
  const fmt = (v: number) => `${symbol}${(v / (jpy ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const last = values.length - 1
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex h-12 items-end gap-1"
        role="img"
        aria-label={`Weekly spend, last ${values.length} weeks; most recent ${fmt(values[last] ?? 0)}`}
      >
        {values.map((v, i) => {
          const weeksAgo = last - i
          const pct = v > 0 ? Math.max(6, (v / max) * 100) : 3
          return (
            <div
              key={i}
              title={`${weeksAgo === 0 ? 'This week' : `${weeksAgo} wk ago`}: ${fmt(v)}`}
              className={`flex-1 rounded-t ${i === last ? 'bg-accent-2' : 'bg-white/20'}`}
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>
      <span className="text-[10px] text-muted-foreground">Last {values.length} weeks</span>
    </div>
  )
}

function topNByCategoryWithConversion(
  entries: ReturnType<typeof useMoneyEntries>,
  catName: Map<string, ReturnType<typeof useCategories>[number]>,
  primaryCurrency: string,
  rates: Array<{ date: string; target: string; rate: number }>,
  overrides: Record<string, number>,
  n: number,
): Array<[ReturnType<typeof useCategories>[number] | undefined, number]> {
  const totals = new Map<string | undefined, number>()
  for (const e of entries) {
    if (e.direction !== 'out') continue
    const key = e.category_id ?? undefined
    if (e.currency === primaryCurrency) {
      totals.set(key, (totals.get(key) ?? 0) + e.amount)
    } else {
      const conv = convertViaRates(e.amount, e.currency, primaryCurrency, e.occurred_at, rates, overrides)
      if (conv) {
        totals.set(key, (totals.get(key) ?? 0) + conv.amount)
      }
    }
  }
  return [...totals.entries()]
    .map(([cid, amt]) => [cid ? catName.get(cid) : undefined, amt] as [ReturnType<typeof useCategories>[number] | undefined, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

function currentPeriodRange(period: PeriodKind): { from: string; to: string } {
  const now = new Date()
  if (period === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    return { from, to }
  }
  // week: Mon → next Mon, UTC
  const day = now.getUTCDay() || 7   // 1..7, Sun=7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)))
  const nextMonday = new Date(monday); nextMonday.setUTCDate(nextMonday.getUTCDate() + 7)
  return { from: monday.toISOString(), to: nextMonday.toISOString() }
}

function previousPeriodRange(period: PeriodKind, current: { from: string; to: string }): { from: string; to: string } {
  const fromCur = new Date(current.from)
  if (period === 'month') {
    const from = new Date(Date.UTC(fromCur.getUTCFullYear(), fromCur.getUTCMonth() - 1, 1)).toISOString()
    return { from, to: current.from }
  }
  const toCur = new Date(current.to)
  toCur.setUTCDate(toCur.getUTCDate() - 7)
  const fromPrev = new Date(fromCur); fromPrev.setUTCDate(fromPrev.getUTCDate() - 7)
  return { from: fromPrev.toISOString(), to: current.from }
}
