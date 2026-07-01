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
      const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates)
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
      const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates)
      if (conv) previousPrimary += conv.amount
    }
  }

  const delta = previousPrimary === 0 ? null : ((primarySpend - previousPrimary) / previousPrimary) * 100

  const topCategories = useMemo(() => topNByCategoryWithConversion(current, catName, prefs.primary_currency, rates, 3), [current, catName, prefs.primary_currency, rates])
  const topMax = Math.max(1, ...topCategories.map(([, amt]) => amt))

  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">This month</span>
        {delta !== null && (
          <span className={`text-xs font-medium ${delta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(0)}% vs last
          </span>
        )}
      </header>
      <div className="text-3xl font-semibold tabular-nums">
        {currencySymbol(prefs.primary_currency)}
        {(primarySpend / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <ul className="flex flex-col gap-1.5 pt-1">
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
            <span className="tabular-nums">{currencySymbol(prefs.primary_currency)}{(amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(0)}</span>
          </li>
        ))}
      </ul>
      {(conversionApplied || skippedCurrencies.size > 0) && (
        <p className="border-t pt-2 text-[10px] text-muted-foreground">
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

function topNByCategoryWithConversion(
  entries: ReturnType<typeof useMoneyEntries>,
  catName: Map<string, ReturnType<typeof useCategories>[number]>,
  primaryCurrency: string,
  rates: Array<{ date: string; target: string; rate: number }>,
  n: number,
): Array<[ReturnType<typeof useCategories>[number] | undefined, number]> {
  const totals = new Map<string | undefined, number>()
  for (const e of entries) {
    if (e.direction !== 'out') continue
    const key = e.category_id ?? undefined
    if (e.currency === primaryCurrency) {
      totals.set(key, (totals.get(key) ?? 0) + e.amount)
    } else {
      const conv = convertViaRates(e.amount, e.currency, primaryCurrency, e.occurred_at, rates)
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
