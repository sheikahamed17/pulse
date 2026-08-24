import { describe, it, expect } from 'vitest'
import { detectSpendingAnomalies } from './spending-anomaly'
import type { CategorySeries } from './analytics'

describe('detectSpendingAnomalies', () => {
  it('flags a category spiking 3x with delta >= MIN_DELTA', () => {
    const series: CategorySeries[] = [
      { name: 'Dining', icon: '🍽️', points: [100000, 100000, 300000] },
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toMatchObject({
      name: 'Dining',
      icon: '🍽️',
      current: 300000,
      baseline: 100000,
      pct: 200,
    })
  })

  it('does not flag a category under the factor (1.4x)', () => {
    const series: CategorySeries[] = [
      { name: 'Groceries', icon: '🛒', points: [100000, 100000, 140000] },
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(0)
  })

  it('does not flag a category over factor but under MIN_DELTA', () => {
    const series: CategorySeries[] = [
      { name: 'Transport', icon: '🚗', points: [10000, 10000, 20000] },
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(0)
  })

  it('does not flag a category with baseline 0 (new category)', () => {
    const series: CategorySeries[] = [
      { name: 'NewCategory', icon: null, points: [0, 0, 80000] },
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(0)
  })

  it('skips categories with points.length < 2', () => {
    const series: CategorySeries[] = [
      { name: 'OnePoint', icon: null, points: [100000] },
      { name: 'Empty', icon: null, points: [] },
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(0)
  })

  it('returns multiple anomalies sorted by delta descending and capped at 5', () => {
    const series: CategorySeries[] = [
      { name: 'Dining', icon: '🍽️', points: [100000, 100000, 400000] }, // delta: 300000
      { name: 'Groceries', icon: '🛒', points: [100000, 100000, 250000] }, // delta: 150000
      { name: 'Transport', icon: '🚗', points: [50000, 50000, 200000] }, // delta: 150000
      { name: 'Entertainment', icon: '🎬', points: [75000, 75000, 300000] }, // delta: 225000
      { name: 'Utilities', icon: '💡', points: [30000, 30000, 120000] }, // delta: 90000
      { name: 'Healthcare', icon: '🏥', points: [40000, 40000, 160000] }, // delta: 120000
      { name: 'Fitness', icon: '🏋️', points: [20000, 20000, 80000] }, // delta: 60000
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(5)
    // Check sorted by delta descending
    expect(anomalies[0].name).toBe('Dining') // 300000
    expect(anomalies[1].name).toBe('Entertainment') // 225000
    expect(anomalies[2].name).toBe('Groceries') // 150000
    expect(anomalies[3].name).toBe('Transport') // 150000 - same delta as Groceries but comes after
    expect(anomalies[4].name).toBe('Healthcare') // 120000
  })

  it('returns empty array for empty input', () => {
    const anomalies = detectSpendingAnomalies([])
    expect(anomalies).toEqual([])
  })

  it('respects custom factor parameter', () => {
    const series: CategorySeries[] = [
      { name: 'Test', icon: null, points: [100000, 100000, 200000] }, // 2x, delta 100000
    ]
    // With default factor 1.5: 200000 >= 150000 ✓ and delta >= 50000 ✓ → flagged
    expect(detectSpendingAnomalies(series, 1.5)).toHaveLength(1)
    // With factor 2.5: 200000 >= 250000 ✗ → not flagged
    expect(detectSpendingAnomalies(series, 2.5)).toHaveLength(0)
  })

  it('respects custom minDelta parameter', () => {
    const series: CategorySeries[] = [
      { name: 'Test', icon: null, points: [100000, 100000, 200000] }, // 2x, delta 100000
    ]
    // With default minDelta 50000: delta >= 50000 ✓ → flagged
    expect(detectSpendingAnomalies(series, 1.5, 50000)).toHaveLength(1)
    // With minDelta 150000: delta >= 150000 ✗ → not flagged
    expect(detectSpendingAnomalies(series, 1.5, 150000)).toHaveLength(0)
  })

  it('does not mutate input series', () => {
    const series: CategorySeries[] = [
      { name: 'Dining', icon: '🍽️', points: [100000, 100000, 300000] },
      { name: 'Groceries', icon: '🛒', points: [100000, 100000, 250000] },
    ]
    const originalLength = series.length
    const originalFirstPoints = [...series[0].points]
    detectSpendingAnomalies(series)
    expect(series).toHaveLength(originalLength)
    expect(series[0].points).toEqual(originalFirstPoints)
  })

  it('calculates percentage correctly', () => {
    const series: CategorySeries[] = [
      { name: 'Test', icon: null, points: [100000, 100000, 150000] }, // (150000 - 100000) / 100000 = 50%
    ]
    const anomalies = detectSpendingAnomalies(series)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].pct).toBe(50)
  })
})
