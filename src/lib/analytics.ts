import type { MoneyEntryRow } from '@/lib/dexie'

export type Period = { from: string; to: string; label: string }

export type Mover = {
  name: string
  icon: string | null
  current: number
  previous: number
  delta: number
  deltaPct: number | null
}

export type CategorySeries = { name: string; icon: string | null; points: number[] }

export function analyticsPeriods(nowMs: number, bucket: 'week' | 'month', count: number): Period[] {
  const d = new Date(nowMs)

  if (bucket === 'month') {
    const periods: Period[] = []
    for (let i = count - 1; i >= 0; i--) {
      const fromDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
      const toDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 1))
      const from = fromDate.toISOString()
      const to = toDate.toISOString()
      const label = fromDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
      periods.push({ from, to, label })
    }
    return periods
  }

  // week: align to Monday
  const dayOfWeek = d.getUTCDay()
  const daysBackToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentMonday = new Date(d.getTime() - daysBackToMonday * 24 * 60 * 60 * 1000)
  currentMonday.setUTCHours(0, 0, 0, 0)

  const periods: Period[] = []
  for (let i = count - 1; i >= 0; i--) {
    const fromMs = currentMonday.getTime() - i * 7 * 24 * 60 * 60 * 1000
    const fromDate = new Date(fromMs)
    const toDate = new Date(fromMs + 7 * 24 * 60 * 60 * 1000)

    const from = fromDate.toISOString()
    const to = toDate.toISOString()
    const label = fromDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    periods.push({ from, to, label })
  }

  return periods
}

export function computeTopMovers(
  current: MoneyEntryRow[],
  previous: MoneyEntryRow[],
  opts: { resolve: (id: string | null) => { name: string; icon: string | null } | null; toPrimary: (e: MoneyEntryRow) => number }
): Mover[] {
  const { resolve, toPrimary } = opts

  // Group current entries by resolved category name
  const currentByName = new Map<string, { name: string; icon: string | null; total: number }>()
  for (const entry of current) {
    if (entry.direction !== 'out') continue
    const resolved = resolve(entry.category_id)
    const name = resolved?.name ?? 'Uncategorized'
    const icon = resolved?.icon ?? null
    const amount = toPrimary(entry)
    if (!currentByName.has(name)) {
      currentByName.set(name, { name, icon, total: 0 })
    }
    currentByName.get(name)!.total += amount
  }

  // Group previous entries by resolved category name
  const previousByName = new Map<string, { name: string; icon: string | null; total: number }>()
  for (const entry of previous) {
    if (entry.direction !== 'out') continue
    const resolved = resolve(entry.category_id)
    const name = resolved?.name ?? 'Uncategorized'
    const icon = resolved?.icon ?? null
    const amount = toPrimary(entry)
    if (!previousByName.has(name)) {
      previousByName.set(name, { name, icon, total: 0 })
    }
    previousByName.get(name)!.total += amount
  }

  // Compute movers
  const allNames = new Set([...currentByName.keys(), ...previousByName.keys()])
  const movers: Mover[] = []

  for (const name of allNames) {
    const currData = currentByName.get(name)
    const prevData = previousByName.get(name)
    const currentAmount = currData?.total ?? 0
    const previousAmount = prevData?.total ?? 0
    const icon = currData?.icon ?? prevData?.icon ?? null

    const delta = currentAmount - previousAmount
    const deltaPct = previousAmount === 0 ? null : (delta / previousAmount) * 100

    movers.push({
      name,
      icon,
      current: currentAmount,
      previous: previousAmount,
      delta,
      deltaPct,
    })
  }

  // Sort by |delta| desc
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return movers
}

export function computeCategorySeries(
  entries: MoneyEntryRow[],
  opts: { periods: Period[]; resolve: (id: string | null) => { name: string; icon: string | null } | null; toPrimary: (e: MoneyEntryRow) => number; topN: number }
): CategorySeries[] {
  const { periods, resolve, toPrimary, topN } = opts

  // Build a map: category name -> points array
  const categoryMap = new Map<string, { name: string; icon: string | null; points: number[] }>()

  // Initialize all categories with zero points for each period
  const categoryTotals = new Map<string, number>()

  // Process entries
  for (const entry of entries) {
    if (entry.direction !== 'out') continue

    const resolved = resolve(entry.category_id)
    const name = resolved?.name ?? 'Uncategorized'
    const icon = resolved?.icon ?? null

    // Find which period this entry belongs to
    let periodIndex = -1
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i]
      if (entry.occurred_at >= period.from && entry.occurred_at < period.to) {
        periodIndex = i
        break
      }
    }

    if (periodIndex === -1) continue // Entry doesn't belong to any period

    const amount = toPrimary(entry)

    // Initialize if needed
    if (!categoryMap.has(name)) {
      categoryMap.set(name, { name, icon, points: Array(periods.length).fill(0) })
    }

    // Add amount to the correct period point
    categoryMap.get(name)!.points[periodIndex] += amount

    // Update total
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + amount)
  }

  // Rank categories by total spend
  const ranked = Array.from(categoryMap.entries())
    .sort((a, b) => (categoryTotals.get(b[0]) ?? 0) - (categoryTotals.get(a[0]) ?? 0))
    .slice(0, topN)

  // Extract the top N categories
  const topCategories: CategorySeries[] = ranked.map(([_, data]) => data)

  // If there are more categories, fold into "Other"
  if (categoryMap.size > topN) {
    const otherPoints = Array(periods.length).fill(0)
    for (const [name, data] of categoryMap) {
      if (!ranked.some(([rname]) => rname === name)) {
        // This category was not in the top N, add its points to "Other"
        for (let i = 0; i < periods.length; i++) {
          otherPoints[i] += data.points[i]
        }
      }
    }
    topCategories.push({ name: 'Other', icon: null, points: otherPoints })
  }

  return topCategories
}
