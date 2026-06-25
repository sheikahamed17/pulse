'use client'

import { useMemo } from 'react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'

type Props = { userId: string }

type PeriodKind = 'week' | 'month'

export function MoneyCard({ userId }: Props) {
  const period: PeriodKind = 'month'   // Phase 1 default; Phase 2 lets user toggle
  const range = useMemo(() => currentPeriodRange(period), [period])
  const prevRange = useMemo(() => previousPeriodRange(period, range), [period, range])

  const current = useMoneyEntries(userId, range)
  const previous = useMoneyEntries(userId, prevRange)
  const categories = useCategories(userId)
  const catName = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const currentSpend  = sumDirection(current,  'out')
  const previousSpend = sumDirection(previous, 'out')
  const delta = previousSpend === 0 ? null : ((currentSpend - previousSpend) / previousSpend) * 100

  const topCategories = useMemo(() => topNByCategory(current, catName, 3), [current, catName])
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
        ₹{(currentSpend / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
            <span className="tabular-nums">₹{(amt / 100).toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function sumDirection(entries: ReturnType<typeof useMoneyEntries>, dir: 'out' | 'in'): number {
  return entries.filter(e => e.direction === dir).reduce((s, e) => s + e.amount, 0)
}

function topNByCategory(
  entries: ReturnType<typeof useMoneyEntries>,
  catName: Map<string, ReturnType<typeof useCategories>[number]>,
  n: number,
): Array<[ReturnType<typeof useCategories>[number] | undefined, number]> {
  const totals = new Map<string | undefined, number>()
  for (const e of entries) {
    if (e.direction !== 'out') continue
    const key = e.category_id ?? undefined
    totals.set(key, (totals.get(key) ?? 0) + e.amount)
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
