'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { BarTrend } from '@/components/charts/bar-trend'
import { DualSeriesTrend } from '@/components/charts/dual-series-trend'
import { MoversBars } from '@/components/charts/movers-bars'
import { CategorySmallMultiples } from '@/components/charts/category-small-multiples'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { analyticsPeriods, computeTopMovers, computeCategorySeries } from '@/lib/analytics'

export default function AnalyticsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [bucket, setBucket] = useState<'week' | 'month'>('month')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const count = bucket === 'week' ? 12 : 6
  const entries = useMoneyEntries(userId ?? undefined)
  const allCats = useAllCategories(userId ?? undefined)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  const nowMs = useMemo(() => new Date().getTime(), [])

  const resolve = useMemo(
    () =>
      makeCategoryResolver(
        allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind })),
      ),
    [allCats],
  )

  const toPrimary = useMemo(
    () => (e: typeof entries[0]) =>
      e.currency === prefs.primary_currency
        ? e.amount
        : convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const periods = useMemo(() => analyticsPeriods(nowMs, bucket, count), [nowMs, bucket, count])

  // Compute spend and income series aligned 1:1 to periods
  const spendSeries = useMemo(() => {
    return periods.map(p => ({
      label: p.label,
      amount: entries
        .filter(e => e.direction === 'out' && e.occurred_at >= p.from && e.occurred_at < p.to && !e.deleted_at)
        .reduce((sum, e) => sum + toPrimary(e), 0),
    }))
  }, [periods, entries, toPrimary])

  const incomeSeries = useMemo(() => {
    return periods.map(p => ({
      label: p.label,
      amount: entries
        .filter(e => e.direction === 'in' && e.occurred_at >= p.from && e.occurred_at < p.to && !e.deleted_at)
        .reduce((sum, e) => sum + toPrimary(e), 0),
    }))
  }, [periods, entries, toPrimary])

  // Compute movers (current vs previous period)
  const movers = useMemo(() => {
    if (periods.length < 2) return []
    const currentPeriod = periods[periods.length - 1]
    const previousPeriod = periods[periods.length - 2]

    const currentEntries = entries.filter(
      e => e.occurred_at >= currentPeriod.from && e.occurred_at < currentPeriod.to && !e.deleted_at,
    )
    const previousEntries = entries.filter(
      e => e.occurred_at >= previousPeriod.from && e.occurred_at < previousPeriod.to && !e.deleted_at,
    )

    return computeTopMovers(currentEntries, previousEntries, { resolve, toPrimary })
  }, [periods, entries, resolve, toPrimary])

  // Compute category series
  const catSeries = useMemo(
    () => computeCategorySeries(entries.filter(e => !e.deleted_at), { periods, resolve, toPrimary, topN: 6 }),
    [entries, periods, resolve, toPrimary],
  )

  const symbol = currencySymbol(prefs.primary_currency)
  const jpy = prefs.primary_currency === 'JPY'

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <div className="flex gap-2">
            {(['week', 'month'] as const).map(b => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`min-h-[44px] px-3 py-1 text-xs font-medium uppercase tracking-wide rounded transition-colors ${
                  bucket === b ? 'text-accent-2' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Spend per period */}
        <div className="glass rounded-2xl p-4">
          <BarTrend data={spendSeries} symbol={symbol} jpy={jpy} label="Spend per period" />
        </div>

        {/* Income vs Spend + Net */}
        <div className="glass rounded-2xl p-4">
          <DualSeriesTrend spend={spendSeries} income={incomeSeries} symbol={symbol} jpy={jpy} />
        </div>

        {/* Top Movers */}
        <div className="glass rounded-2xl p-4">
          <MoversBars movers={movers} symbol={symbol} jpy={jpy} />
        </div>

        {/* Spending by Category */}
        <div className="glass rounded-2xl p-4">
          <CategorySmallMultiples series={catSeries} periods={periods} symbol={symbol} jpy={jpy} />
        </div>

        <Link href="/app" className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">← Back to Pulse</Link>
      </main>
    </>
  )
}
