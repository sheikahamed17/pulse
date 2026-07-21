import type { BudgetRow, MoneyEntryRow } from '@/lib/dexie'

export type BudgetProgress = {
  categoryId: string
  limit: number                     // in user's PRIMARY currency minor units (whole yen for JPY, cents for USD/INR/etc)
  spent: number                     // in user's PRIMARY currency minor units (whole yen for JPY, cents for USD/INR/etc)
  pct: number                       // rounded, display only
  state: 'ok' | 'warn' | 'over'
}

/** "YYYY-MM" of an ISO instant as seen in the given IANA tz. */
export function yearMonthInTz(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  return `${y}-${m}`
}

export function computeBudgetProgress(
  entries: MoneyEntryRow[],
  budgets: BudgetRow[],
  monthKey: string,
  tz: string,
  toPrimary: (e: MoneyEntryRow) => number,
): BudgetProgress[] {
  const spentByCat = new Map<string, number>()
  for (const e of entries) {
    if (e.deleted_at) continue
    if (e.direction !== 'out') continue
    if (!e.category_id) continue
    if (yearMonthInTz(e.occurred_at, tz) !== monthKey) continue
    spentByCat.set(e.category_id, (spentByCat.get(e.category_id) ?? 0) + toPrimary(e))
  }

  return budgets
    .filter(b => !b.deleted_at)
    .map(b => {
      const spent = spentByCat.get(b.category_id) ?? 0
      const limit = b.amount
      const ratio = limit > 0 ? spent / limit : 0
      const state: BudgetProgress['state'] = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
      return { categoryId: b.category_id, limit, spent, pct: Math.round(ratio * 100), state }
    })
    .sort((a, b) => b.pct - a.pct)
}
