'use client'

import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useCategories } from '@/hooks/use-categories'
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
  const categories = useCategories(userId)

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const targetCategoryId = useMemo(() => {
    if (!plan.category_name) return null
    const expectedKind = plan.direction === 'out' ? 'spend' : 'income'
    const match = categories.find(c => c.name === plan.category_name && c.kind === expectedKind)
    return match?.id ?? null
  }, [plan.category_name, plan.direction, categories])

  const { total, count, conversionDate, multiCurrency } = useMemo(() => {
    let total = 0
    let count = 0
    let multi = false
    let conversionDate: string | null = null
    const seenCurrencies = new Set<string>()
    for (const e of entries) {
      if (e.direction !== plan.direction) continue
      if (targetCategoryId && e.category_id !== targetCategoryId) continue
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
  }, [entries, plan.direction, targetCategoryId, prefs.primary_currency, rates])

  const divisor = prefs.primary_currency === 'JPY' ? 1 : 100
  const major = (total / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-accent-2">
          {plan.direction === 'out' ? '💸 Spent' : '💰 Earned'}
          {plan.category_name && ` in ${plan.category_name}`}
          {' · '}
          {plan.period.label}
        </span>
      </div>

      <div className="mb-2 text-4xl font-semibold font-mono tabular-nums text-accent-2">
        {currencySymbol(prefs.primary_currency)}{major}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Based on {count} {count === 1 ? 'entry' : 'entries'}
      </p>

      {plan.category_name && !targetCategoryId && (
        <p className="mb-3 text-[10px] text-destructive">
          Category &quot;{plan.category_name}&quot; not found — showing all categories instead.
        </p>
      )}

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
