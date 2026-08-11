import type { MoneyEntryRow } from '@/lib/dexie'

export type SpendRow = { name: string; icon: string | null; amount: number; count: number; pct: number }
export type SpendBreakdown = { rows: SpendRow[]; spend: number; income: number; net: number }

export function computeSpendBreakdown(
  entries: MoneyEntryRow[],
  opts: { resolve: (id: string | null) => { name: string; icon: string | null } | null; toPrimary: (e: MoneyEntryRow) => number },
): SpendBreakdown {
  const { resolve, toPrimary } = opts
  const agg = new Map<string, { icon: string | null; amount: number; count: number }>()
  let spend = 0,
    income = 0
  for (const e of entries) {
    const amt = toPrimary(e)
    if (e.direction === 'in') {
      income += amt
      continue
    }
    spend += amt
    const id = resolve(e.category_id)
    const name = id?.name ?? 'Uncategorized'
    const cur = agg.get(name)
    if (cur) {
      cur.amount += amt
      cur.count += 1
    } else {
      agg.set(name, { icon: id?.icon ?? null, amount: amt, count: 1 })
    }
  }
  const rows = Array.from(agg.entries())
    .map(([name, v]) => ({ name, icon: v.icon, amount: v.amount, count: v.count, pct: spend ? (v.amount / spend) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { rows, spend, income, net: income - spend }
}
