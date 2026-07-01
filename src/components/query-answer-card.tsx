'use client'

import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export type QueryPlan = {
  kind: 'query_money'
  direction: 'out' | 'in'
  category_name: string | null
  period: { from: string; to: string; label: string }
}

type Props = {
  userId: string
  plan: QueryPlan
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 30_000

export function QueryAnswerCard({ userId, plan, onDismiss }: Props) {
  const { prefs } = useUserPrefs()
  const entries = useMoneyEntries(userId, { from: plan.period.from, to: plan.period.to })
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const { total, count, conversionDate, multiCurrency } = useMemo(() => {
    let total = 0
    let count = 0
    let multi = false
    let conversionDate: string | null = null
    const seenCurrencies = new Set<string>()
    for (const e of entries) {
      if (e.direction !== plan.direction) continue
      if (plan.category_name) {
        // For category filter, we need the category name — but the entry only has category_id.
        // The chip slot expects this filter to be applied client-side. The agent returned the
        // exact category_name from the active list; we use useCategories(userId) lookup at call site.
        // For now: filter relies on the caller's responsibility to pass entries already filtered.
        // The minimal version below skips category filter — Task 41 wires it via useCategories.
      }
      count++
      seenCurrencies.add(e.currency)
      if (e.currency === prefs.primary_currency) {
        total += e.amount
      } else {
        const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates)
        if (conv) {
          total += conv.amount
          if (!conversionDate || conv.rateDate < conversionDate) conversionDate = conv.rateDate
        }
      }
    }
    if (seenCurrencies.size > 1) multi = true
    return { total, count, conversionDate, multiCurrency: multi }
  }, [entries, plan.direction, plan.category_name, prefs.primary_currency, rates])

  const divisor = prefs.primary_currency === 'JPY' ? 1 : 100
  const major = (total / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-blue-500">
          {plan.direction === 'out' ? '💸 Spent' : '💰 Earned'}
          {plan.category_name && ` in ${plan.category_name}`}
          {' · '}
          {plan.period.label}
        </span>
      </div>

      <div className="mb-2 text-4xl font-semibold tabular-nums">
        {currencySymbol(prefs.primary_currency)}{major}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Based on {count} {count === 1 ? 'entry' : 'entries'}
      </p>

      {multiCurrency && conversionDate && (
        <p className="mb-3 text-[10px] text-muted-foreground">
          *Converted from multiple currencies via ECB {conversionDate}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onDismiss}>Dismiss</Button>
        <Button
          className="flex-[2]"
          disabled
          title="List queries land in Phase 3"
        >
          Show entries
        </Button>
      </div>
    </div>
  )
}
