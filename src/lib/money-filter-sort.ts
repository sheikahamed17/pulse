import type { MoneyEntryRow } from '@/lib/dexie'

export type MoneySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

/** Compute month bounds using UTC date math.
 *  monthsAgo=0 → current month; monthsAgo=1 → last month; etc.
 *  Returns { from, to } ISO strings for the 1st day of each boundary month at 00:00:00 UTC.
 *  Handles year underflow correctly via Date.UTC (negative months roll back years).
 */
export function monthBounds(nowMs: number, monthsAgo: number): { from: string; to: string } {
  const d = new Date(nowMs)
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo, 1)).toISOString()
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo + 1, 1)).toISOString()
  return { from, to }
}

export type MoneyFilter = {
  categoryName: string | null
  source: MoneyEntryRow['source'] | null
  direction: 'out' | 'in' | null
  from: string | null
  to: string | null
}

export const EMPTY_MONEY_FILTER: MoneyFilter = {
  categoryName: null,
  source: null,
  direction: null,
  from: null,
  to: null,
}

/** Filter then sort money entries. Pure; does not mutate input.
 *  - Category matches by RESOLVED name (dupe/tombstoned ids merge by name)
 *  - categoryName === 'Uncategorized' means resolve→null
 *  - Date range: from <= occurred_at < to
 *  - Amount sorts by amount field
 *  - Date sorts by occurred_at
 */
export function filterSortMoney(
  rows: MoneyEntryRow[],
  filter: MoneyFilter,
  sort: MoneySort,
  resolve: (id: string | null) => { name: string; icon: string | null } | null,
): MoneyEntryRow[] {
  // Filter
  let filtered = rows.filter(r => {
    // Category filter
    if (filter.categoryName !== null) {
      const resolved = resolve(r.category_id)
      const entryName = resolved?.name ?? 'Uncategorized'
      if (entryName !== filter.categoryName) return false
    }

    // Source filter
    if (filter.source !== null && r.source !== filter.source) return false

    // Direction filter
    if (filter.direction !== null && r.direction !== filter.direction) return false

    // Date range filter: from <= occurred_at < to
    if (filter.from !== null && r.occurred_at < filter.from) return false
    if (filter.to !== null && r.occurred_at >= filter.to) return false

    return true
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'date-desc':
        return b.occurred_at.localeCompare(a.occurred_at)
      case 'date-asc':
        return a.occurred_at.localeCompare(b.occurred_at)
      case 'amount-desc':
        return b.amount - a.amount
      case 'amount-asc':
        return a.amount - b.amount
    }
  })

  return sorted
}
