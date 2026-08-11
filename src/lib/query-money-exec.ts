import type { MoneyEntryRow } from '@/lib/dexie'

export type FetchRange = { from: string; to: string }

/**
 * Compute the fetch range for delta mode to include both current and previous periods.
 * For other modes, returns the current period only.
 */
export function deltaFetchRange(
  mode: 'total' | 'breakdown' | 'delta' | 'series',
  period: { from: string; to: string },
): FetchRange {
  if (mode !== 'delta') {
    return { from: period.from, to: period.to }
  }

  // For delta mode, calculate the previous period length and extend the fetch
  const from = new Date(period.from).getTime()
  const to = new Date(period.to).getTime()
  const len = to - from
  const prevFrom = new Date(from - len).toISOString()

  return { from: prevFrom, to: period.to }
}

export type BreakdownOptions = {
  direction: 'out' | 'in'
  categoryNameOf: (categoryId: string | null) => string | null
}

export type BreakdownResult = {
  categoryName: string | null
  amount: number
}

/**
 * Compute breakdown by category for money entries.
 * Returns sorted list (descending by amount) of category totals.
 * toPrimary receives the whole entry and returns its amount converted to primary currency.
 */
export function computeMoneyBreakdown(
  entries: MoneyEntryRow[],
  options: BreakdownOptions,
  toPrimary: (entry: MoneyEntryRow) => number,
): BreakdownResult[] {
  const { direction, categoryNameOf } = options

  const totals = new Map<string | null, number>()

  for (const e of entries) {
    if (e.direction !== direction) continue
    const key = e.category_id ?? null
    const amount = toPrimary(e)
    totals.set(key, (totals.get(key) ?? 0) + amount)
  }

  // Group raw by category_id (unchanged), then MERGE by resolved name so an old
  // tombstoned id and the canonical id — or same-named dupes — collapse into one
  // row instead of splitting into a real row + a phantom "Uncategorized".
  const byName = new Map<string | null, number>()   // key: resolved name (null = uncategorized)
  for (const [categoryId, amount] of totals.entries()) {
    const name = categoryNameOf(categoryId)
    byName.set(name, (byName.get(name) ?? 0) + amount)
  }
  return Array.from(byName.entries())
    .map(([categoryName, amount]) => ({ categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export type DeltaResult = {
  current: number
  previous: number
  deltaPct: number | null
}

/**
 * Compute delta between current and previous period.
 * Returns current, previous, and deltaPct (null if previous is 0).
 * toPrimary receives the whole entry and returns its amount converted to primary currency.
 */
export function computeMoneyDelta(
  currentEntries: MoneyEntryRow[],
  previousEntries: MoneyEntryRow[],
  direction: 'out' | 'in',
  toPrimary: (entry: MoneyEntryRow) => number,
): DeltaResult {
  let current = 0
  let previous = 0

  for (const e of currentEntries) {
    if (e.direction === direction) {
      current += toPrimary(e)
    }
  }

  for (const e of previousEntries) {
    if (e.direction === direction) {
      previous += toPrimary(e)
    }
  }

  const deltaPct = previous === 0 ? null : ((current - previous) / previous) * 100

  return { current, previous, deltaPct }
}

export type SeriesOptions = {
  from: string
  to: string
  bucket: 'day' | 'week' | 'month'
  direction: 'out' | 'in'
}

export type SeriesResult = {
  label: string
  amount: number
}

/**
 * Compute time-series breakdown bucketed by day/week/month.
 * Returns array of { label, amount } sorted chronologically.
 * toPrimary receives the whole entry and returns its amount converted to primary currency.
 */
export function computeMoneySeries(
  entries: MoneyEntryRow[],
  options: SeriesOptions,
  toPrimary: (entry: MoneyEntryRow) => number,
): SeriesResult[] {
  const { from, to, bucket, direction } = options

  const fromDate = new Date(from)
  const toDate = new Date(to)

  // Build buckets
  const buckets = new Map<string, number>()

  if (bucket === 'day') {
    // Daily buckets from fromDate to toDate
    const current = new Date(fromDate)
    while (current < toDate) {
      const label = current.toISOString().split('T')[0]
      buckets.set(label, 0)
      current.setUTCDate(current.getUTCDate() + 1)
    }
  } else if (bucket === 'week') {
    // Weekly buckets (Monday-based, ISO weeks)
    const current = new Date(fromDate)
    // Align to Monday
    const day = current.getUTCDay() || 7
    current.setUTCDate(current.getUTCDate() - (day - 1))

    while (current < toDate) {
      const label = current.toISOString().split('T')[0]
      buckets.set(label, 0)
      current.setUTCDate(current.getUTCDate() + 7)
    }
  } else if (bucket === 'month') {
    // Monthly buckets
    const current = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1))
    while (current < toDate) {
      const label = current.toISOString().split('T')[0].slice(0, 7)
      buckets.set(label, 0)
      current.setUTCMonth(current.getUTCMonth() + 1)
    }
  }

  // Aggregate entries into buckets
  for (const e of entries) {
    if (e.direction !== direction) continue

    const entryDate = new Date(e.occurred_at)
    if (entryDate < fromDate || entryDate >= toDate) continue

    let bucketKey: string
    if (bucket === 'day') {
      bucketKey = entryDate.toISOString().split('T')[0]
    } else if (bucket === 'week') {
      // Align to Monday
      const day = entryDate.getUTCDay() || 7
      const monday = new Date(entryDate)
      monday.setUTCDate(monday.getUTCDate() - (day - 1))
      bucketKey = monday.toISOString().split('T')[0]
    } else {
      // month
      bucketKey = entryDate.toISOString().split('T')[0].slice(0, 7)
    }

    const amount = toPrimary(e)
    buckets.set(bucketKey, (buckets.get(bucketKey) ?? 0) + amount)
  }

  // Convert to result array and sort chronologically
  return Array.from(buckets.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
