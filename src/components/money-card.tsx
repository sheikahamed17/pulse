'use client'

import { useMemo } from 'react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { convertViaRates } from '@/lib/fx'
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

  // Compute sparkline data: group entries into daily totals (last 7 days)
  const sparklinePoints = useMemo(() => {
    const dailyTotals = new Map<string, number>()
    const now = new Date(range.to)

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - i)
      const dateKey = d.toISOString().split('T')[0]
      dailyTotals.set(dateKey, 0)
    }

    for (const e of current) {
      if (e.direction !== 'out') continue
      const dateKey = e.occurred_at.split('T')[0]
      if (dailyTotals.has(dateKey)) {
        let amount = e.amount
        if (e.currency !== prefs.primary_currency) {
          const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
          if (conv) amount = conv.amount
        }
        dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + amount)
      }
    }

    return Array.from(dailyTotals.values())
  }, [current, prefs.primary_currency, rates, range.to])

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

function Sparkline({ points, width = 80, height = 48 }: { points: number[], width?: number, height?: number }) {
  if (points.length < 2) return null

  const max = Math.max(...points, 1)
  const min = 0
  const range = max - min

  const padding = 4
  const chartWidth = width - 2 * padding
  const chartHeight = height - 2 * padding

  const xs = points.map((_, i) => padding + (i / (points.length - 1)) * chartWidth)
  const ys = points.map(p => padding + chartHeight - (((p - min) / range) * chartHeight))

  const pathPoints = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const areaPath = `M${padding},${height - padding} ${pathPoints} L${width - padding},${height - padding}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <defs>
        <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'rgb(52 230 255)', stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: 'rgb(52 230 255)', stopOpacity: 0.05 }} />
        </linearGradient>
      </defs>
      <polyline points={pathPoints} fill="none" stroke="rgb(52 230 255)" strokeWidth="1.5" />
      <path d={areaPath} fill="url(#sparkGradient)" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill="rgb(52 230 255)" />
    </svg>
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
