'use client'

import { useMemo } from 'react'
import { BarTrend } from '@/components/charts/bar-trend'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { convertViaRates } from '@/lib/fx'
import { analyticsPeriods } from '@/lib/analytics'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

type Props = { userId: string }

export function SpendTrendWidget({ userId }: Props) {
  const entries = useMoneyEntries(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  const nowMs = useMemo(() => new Date().getTime(), [])
  const periods = useMemo(() => analyticsPeriods(nowMs, 'month', 6), [nowMs])

  const toPrimary = useMemo(
    () => (e: typeof entries[0]) =>
      e.currency === prefs.primary_currency
        ? e.amount
        : convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const spendSeries = useMemo(() => {
    return periods.map(p => ({
      label: p.label,
      amount: entries
        .filter(e => e.direction === 'out' && e.occurred_at >= p.from && e.occurred_at < p.to && !e.deleted_at)
        .reduce((sum, e) => sum + toPrimary(e), 0),
    }))
  }, [periods, entries, toPrimary])

  const symbol = currencySymbol(prefs.primary_currency)
  const jpy = prefs.primary_currency === 'JPY'

  return <BarTrend data={spendSeries} symbol={symbol} jpy={jpy} label="Last 6 months spend" />
}
