import { describe, it, expect } from 'vitest'
import { habitStreaks, addDays } from './habits'

const today = '2026-08-22'

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-08-22', 1)).toBe('2026-08-23')
    expect(addDays('2026-08-22', 5)).toBe('2026-08-27')
  })

  it('subtracts negative days', () => {
    expect(addDays('2026-08-22', -1)).toBe('2026-08-21')
    expect(addDays('2026-08-22', -5)).toBe('2026-08-17')
  })

  it('handles month boundaries', () => {
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
  })

  it('handles year boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })
})

describe('habitStreaks', () => {
  it('completed today + prior 4 consecutive → current: 5, completedToday: true', () => {
    const days = ['2026-08-22', '2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(5)
    expect(result.completedToday).toBe(true)
    expect(result.longest).toBe(5)
  })

  it('completed yesterday + before, NOT today → current = run ending yesterday, completedToday: false', () => {
    const days = ['2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(4)
    expect(result.completedToday).toBe(false)
    expect(result.longest).toBe(4)
  })

  it('neither today nor yesterday → current: 0', () => {
    const days = ['2026-08-20', '2026-08-19', '2026-08-18']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(0)
    expect(result.completedToday).toBe(false)
  })

  it('a gap splits runs → longest = longer run, current reflects only today/yesterday run', () => {
    // Longer run from 2026-08-17 to 2026-08-13 (5 days)
    // Shorter run from 2026-08-21 to 2026-08-20 (2 days)
    const days = ['2026-08-21', '2026-08-20', '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13']
    const result = habitStreaks(days, today)
    expect(result.longest).toBe(5)
    expect(result.current).toBe(2)
    expect(result.completedToday).toBe(false)
  })

  it('rate30: 15 of the last 30 days → 0.5', () => {
    // last 30 days is 2026-07-24 to 2026-08-22 inclusive
    const days = [
      '2026-08-22', '2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18',
      '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13',
      '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09', '2026-08-08',
    ]
    const result = habitStreaks(days, today)
    expect(result.rate30).toBe(0.5)
  })

  it('rate30 excludes days older than 30 days ago', () => {
    // Include 2026-07-23 (31 days ago, should not count)
    // Include 2026-07-24 (30 days ago, should count)
    const days = [
      '2026-07-23', // 31 days ago, excluded
      '2026-07-24', // 30 days ago, included
      '2026-08-22', // today
    ]
    const result = habitStreaks(days, today)
    // Only 2026-07-24 and 2026-08-22 count = 2/30 ≈ 0.0667
    expect(result.rate30).toBeCloseTo(2 / 30, 4)
  })

  it('empty days → all zeros/false', () => {
    const result = habitStreaks([], today)
    expect(result.current).toBe(0)
    expect(result.longest).toBe(0)
    expect(result.completedToday).toBe(false)
    expect(result.rate30).toBe(0)
  })

  it('duplicate day strings deduped', () => {
    const days = ['2026-08-22', '2026-08-22', '2026-08-21', '2026-08-21', '2026-08-20']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(3)
    expect(result.completedToday).toBe(true)
    expect(result.longest).toBe(3)
  })

  it('single day today → current: 1, completedToday: true, longest: 1', () => {
    const days = ['2026-08-22']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(1)
    expect(result.completedToday).toBe(true)
    expect(result.longest).toBe(1)
    expect(result.rate30).toBeCloseTo(1 / 30, 4)
  })

  it('single day yesterday → current: 1, completedToday: false, longest: 1', () => {
    const days = ['2026-08-21']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(1)
    expect(result.completedToday).toBe(false)
    expect(result.longest).toBe(1)
    expect(result.rate30).toBeCloseTo(1 / 30, 4)
  })

  it('old days only, nothing recent → current: 0, longest: non-zero', () => {
    // All days from >30 days ago
    const days = ['2026-07-20', '2026-07-19', '2026-07-18']
    const result = habitStreaks(days, today)
    expect(result.current).toBe(0)
    expect(result.longest).toBe(3)
    expect(result.completedToday).toBe(false)
    expect(result.rate30).toBe(0)
  })
})
