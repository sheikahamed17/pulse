import type { CategorySeries } from './analytics'

export type SpendingAnomaly = {
  name: string
  icon: string | null
  current: number
  baseline: number
  pct: number
}

export const ANOMALY_FACTOR = 1.5
export const ANOMALY_MIN_DELTA = 50000

export function detectSpendingAnomalies(
  series: CategorySeries[],
  factor = ANOMALY_FACTOR,
  minDelta = ANOMALY_MIN_DELTA,
): SpendingAnomaly[] {
  const anomalies: SpendingAnomaly[] = []

  for (const category of series) {
    // Skip categories with insufficient history
    if (category.points.length < 2) continue

    const current = category.points[category.points.length - 1]
    const priorPoints = category.points.slice(0, category.points.length - 1)
    const baselineSum = priorPoints.reduce((sum, p) => sum + p, 0)
    const baseline = baselineSum / priorPoints.length

    // Check anomaly conditions
    if (baseline > 0 && current >= baseline * factor && current - baseline >= minDelta) {
      const pct = Math.round(((current - baseline) / baseline) * 100)
      anomalies.push({
        name: category.name,
        icon: category.icon,
        current,
        baseline,
        pct,
      })
    }
  }

  // Sort by delta descending and cap at 5
  anomalies.sort((a, b) => (b.current - b.baseline) - (a.current - a.baseline))
  return anomalies.slice(0, 5)
}
