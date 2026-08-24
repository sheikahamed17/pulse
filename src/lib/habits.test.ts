import { describe, it, expect } from 'vitest'
import { habitStreaks, addDays, parseSchedule, isScheduledOn } from './habits'

const today = '2026-08-22' // Saturday (weekday 6)

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

describe('parseSchedule', () => {
  it('null → null (daily)', () => {
    expect(parseSchedule(null)).toBeNull()
  })

  it('undefined → null (daily)', () => {
    expect(parseSchedule(undefined)).toBeNull()
  })

  it('empty string → null (daily)', () => {
    expect(parseSchedule('')).toBeNull()
  })

  it('whitespace only → null (daily)', () => {
    expect(parseSchedule('   ')).toBeNull()
  })

  it('parses comma-separated weekdays', () => {
    const result = parseSchedule('1,3,5')
    expect(result).not.toBeNull()
    expect(result).toEqual(new Set([1, 3, 5]))
  })

  it('filters out-of-range weekdays (keep only 0-6)', () => {
    const result = parseSchedule('1,3,5,7,10,-1')
    expect(result).toEqual(new Set([1, 3, 5]))
  })

  it('deduplicates', () => {
    const result = parseSchedule('1,1,3,3,5')
    expect(result).toEqual(new Set([1, 3, 5]))
  })

  it('empty result after filtering → null (daily)', () => {
    const result = parseSchedule('7,8,9')
    expect(result).toBeNull()
  })

  it('all weekdays 0-6', () => {
    const result = parseSchedule('0,1,2,3,4,5,6')
    expect(result).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
  })
})

describe('isScheduledOn', () => {
  it('null schedule → true (daily)', () => {
    expect(isScheduledOn(null, '2026-08-22')).toBe(true)
  })

  it('undefined schedule → true (daily)', () => {
    expect(isScheduledOn(undefined, '2026-08-22')).toBe(true)
  })

  it('2026-08-22 (Saturday=6) with schedule 1,3,5 → false', () => {
    expect(isScheduledOn('1,3,5', '2026-08-22')).toBe(false)
  })

  it('2026-08-21 (Friday=5) with schedule 1,3,5 → true', () => {
    expect(isScheduledOn('1,3,5', '2026-08-21')).toBe(true)
  })

  it('2026-08-20 (Thursday=4) with schedule 1,3,5 → false', () => {
    expect(isScheduledOn('1,3,5', '2026-08-20')).toBe(false)
  })

  it('2026-08-19 (Wednesday=3) with schedule 1,3,5 → true', () => {
    expect(isScheduledOn('1,3,5', '2026-08-19')).toBe(true)
  })
})

describe('habitStreaks', () => {
  describe('daily (schedule null/omitted) — regression tests', () => {
    it('completed today + prior 4 consecutive → current: 5, completedToday: true, dueToday: true', () => {
      const days = ['2026-08-22', '2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 5,
        longest: 5,
        completedToday: true,
        dueToday: true,
        rate30: 5 / 30,
      })
    })

    it('completed yesterday + before, NOT today → current = run ending yesterday, completedToday: false, dueToday: true', () => {
      const days = ['2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 4,
        longest: 4,
        completedToday: false,
        dueToday: true,
        rate30: 4 / 30,
      })
    })

    it('neither today nor yesterday → current: 0, dueToday: true', () => {
      const days = ['2026-08-20', '2026-08-19', '2026-08-18']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 0,
        longest: 3,
        completedToday: false,
        dueToday: true,
        rate30: 3 / 30,
      })
    })

    it('a gap splits runs → longest = longer run, current reflects only today/yesterday run, dueToday: true', () => {
      // Longer run from 2026-08-17 to 2026-08-13 (5 days)
      // Shorter run from 2026-08-21 to 2026-08-20 (2 days)
      const days = ['2026-08-21', '2026-08-20', '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        longest: 5,
        current: 2,
        completedToday: false,
        dueToday: true,
        rate30: 7 / 30,
      })
    })

    it('rate30: 15 of the last 30 days → 0.5, dueToday: true', () => {
      // last 30 days is 2026-07-24 to 2026-08-22 inclusive
      const days = [
        '2026-08-22', '2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18',
        '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13',
        '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09', '2026-08-08',
      ]
      const result = habitStreaks(days, today)
      expect(result.rate30).toBe(0.5)
      expect(result.dueToday).toBe(true)
    })

    it('rate30 excludes days older than 30 days ago, dueToday: true', () => {
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
      expect(result.dueToday).toBe(true)
    })

    it('empty days → all zeros/false, dueToday: true', () => {
      const result = habitStreaks([], today)
      expect(result).toEqual({
        current: 0,
        longest: 0,
        completedToday: false,
        dueToday: true,
        rate30: 0,
      })
    })

    it('duplicate day strings deduped, dueToday: true', () => {
      const days = ['2026-08-22', '2026-08-22', '2026-08-21', '2026-08-21', '2026-08-20']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 3,
        longest: 3,
        completedToday: true,
        dueToday: true,
        rate30: 3 / 30,
      })
    })

    it('single day today → current: 1, completedToday: true, longest: 1, dueToday: true', () => {
      const days = ['2026-08-22']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 1,
        longest: 1,
        completedToday: true,
        dueToday: true,
        rate30: 1 / 30,
      })
    })

    it('single day yesterday → current: 1, completedToday: false, longest: 1, dueToday: true', () => {
      const days = ['2026-08-21']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 1,
        longest: 1,
        completedToday: false,
        dueToday: true,
        rate30: 1 / 30,
      })
    })

    it('old days only, nothing recent → current: 0, longest: non-zero, dueToday: true', () => {
      // All days from >30 days ago
      const days = ['2026-07-20', '2026-07-19', '2026-07-18']
      const result = habitStreaks(days, today)
      expect(result).toEqual({
        current: 0,
        longest: 3,
        completedToday: false,
        dueToday: true,
        rate30: 0,
      })
    })
  })

  describe('scheduled (MWF = 1,3,5) — today is Saturday(6)', () => {
    const schedule = '1,3,5'

    it('completed last 3 scheduled days (Fri, Wed, Mon) → current: 3, dueToday: false', () => {
      // 2026-08-21 = Friday (5) ✓ scheduled
      // 2026-08-20 = Thursday (4) ✗ not scheduled (skipped)
      // 2026-08-19 = Wednesday (3) ✓ scheduled
      // 2026-08-18 = Tuesday (2) ✗ not scheduled (skipped)
      // 2026-08-17 = Monday (1) ✓ scheduled
      const days = ['2026-08-21', '2026-08-19', '2026-08-17']
      const result = habitStreaks(days, today, schedule)
      expect(result.current).toBe(3)
      expect(result.completedToday).toBe(false)
      expect(result.dueToday).toBe(false) // Saturday not in 1,3,5
    })

    it('dueToday: true when today is a scheduled weekday', () => {
      // 2026-08-17 is Monday (1), which is in schedule 1,3,5
      const mondayToday = '2026-08-17'
      const days: string[] = []
      const result = habitStreaks(days, mondayToday, schedule)
      expect(result.dueToday).toBe(true)
    })

    it('missed scheduled day (Wednesday) breaks current streak', () => {
      // 2026-08-21 = Friday (5) ✓ scheduled, completed
      // 2026-08-19 = Wednesday (3) ✓ scheduled, NOT completed → breaks
      // Before that, Mon was completed, but the Wed miss resets
      const days = ['2026-08-21', '2026-08-17']
      const result = habitStreaks(days, today, schedule)
      // Current: only Friday (1), because Wed was missed and breaks before
      expect(result.current).toBe(1)
    })

    it('rate30 with MWF schedule: completed/scheduled in window', () => {
      // Window: 2026-07-24 to 2026-08-22 (30 days)
      // Mon in window: 27, 3, 10, 17 = 4
      // Wed in window: 29, 5, 12, 19 = 4
      // Fri in window: 24, 31, 7, 14, 21 = 5
      // Total scheduled: 4+4+5 = 13
      // We completed 6 of them
      const days = [
        '2026-08-21', // Friday
        '2026-08-19', // Wednesday
        '2026-08-17', // Monday
        '2026-08-14', // Friday
        '2026-08-12', // Wednesday
        '2026-08-10', // Monday
      ]
      const result = habitStreaks(days, today, schedule)
      // 6 completed, 13 scheduled in window → 6/13
      expect(result.rate30).toBe(6 / 13)
    })

    it('non-scheduled today but prior scheduled day completed → streak alive', () => {
      // Today is Saturday (not scheduled in MWF)
      // Friday (last scheduled day) is completed
      const days = ['2026-08-21'] // Friday completed
      const result = habitStreaks(days, today, schedule)
      expect(result.current).toBe(1) // Streak includes the completed Friday
      expect(result.completedToday).toBe(false)
      expect(result.dueToday).toBe(false)
    })

    it('empty schedule sets → null (treated as daily)', () => {
      // This would be parseSchedule returning null for empty/junk
      const resultDaily = habitStreaks(['2026-08-22'], today, null)
      expect(resultDaily.dueToday).toBe(true)
    })
  })

  describe('longest streak with schedule', () => {
    const schedule = '1,3,5' // MWF

    it('longest run of scheduled-and-completed days', () => {
      // Mon-Wed-Fri-Mon-Wed-Fri = 6 scheduled days, all completed
      // Non-scheduled days between them are skipped (neutral)
      const days = [
        '2026-08-21', // Friday
        '2026-08-19', // Wednesday
        '2026-08-17', // Monday
        '2026-08-14', // Friday
        '2026-08-12', // Wednesday
        '2026-08-10', // Monday
      ]
      const result = habitStreaks(days, today, schedule)
      expect(result.longest).toBe(6) // All 6 scheduled days are consecutive (ignoring gaps)
    })

    it('missing scheduled day resets longest', () => {
      // Walk from Aug 10 to Aug 22, counting consecutive SCHEDULED-and-completed days
      // Aug 10 (Mon) ✓, Aug 12 (Wed) ✓, Aug 14 (Fri) ✓, Aug 17 (Mon) ✓ = 4 consecutive scheduled days
      // Aug 19 (Wed) ✗ = missing, resets the run
      // Aug 21 (Fri) ✓ = run of 1
      // Longest = 4 (non-scheduled days between them are skipped/neutral)
      const days = [
        '2026-08-21', // Friday
        '2026-08-17', // Monday
        '2026-08-14', // Friday
        '2026-08-12', // Wednesday
        '2026-08-10', // Monday
      ]
      const result = habitStreaks(days, today, schedule)
      expect(result.longest).toBe(4) // Aug 10, 12, 14, 17 = 4 consecutive scheduled+completed
    })
  })
})
