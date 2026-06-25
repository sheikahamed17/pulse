import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeNextDue, checkEndConditions, type RecurringRule } from '@/lib/recurring'

function mk(overrides: Partial<RecurringRule>): RecurringRule {
  const base = {
    id: 'r1',
    period: 'monthly' as const,
    interval_count: 1,
    anchor_at: '2026-01-01T00:00:00.000Z',
    next_due_at: '2026-01-01T00:00:00.000Z',
    occurrences_so_far: 0,
    end_condition_kind: 'never' as const,
    end_until: null,
    end_count: null,
    is_active: 1,
  }
  const merged = { ...base, ...overrides }
  // If anchor_at wasn't explicitly overridden but next_due_at was, use next_due_at as anchor
  if (!overrides.anchor_at && overrides.next_due_at) {
    merged.anchor_at = overrides.next_due_at
  }
  return merged
}

describe('computeNextDue — daily', () => {
  it('advances by 1 day', () => {
    expect(computeNextDue(mk({ period: 'daily', next_due_at: '2026-06-10T00:00:00.000Z' })))
      .toBe('2026-06-11T00:00:00.000Z')
  })
  it('advances by N days for interval_count=N', () => {
    expect(computeNextDue(mk({ period: 'daily', interval_count: 3, next_due_at: '2026-06-10T00:00:00.000Z' })))
      .toBe('2026-06-13T00:00:00.000Z')
  })
})

describe('computeNextDue — weekly', () => {
  it('advances by 7 days', () => {
    expect(computeNextDue(mk({ period: 'weekly', next_due_at: '2026-06-10T00:00:00.000Z' })))
      .toBe('2026-06-17T00:00:00.000Z')
  })
  it('preserves day-of-week across the month boundary', () => {
    expect(computeNextDue(mk({ period: 'weekly', next_due_at: '2026-06-26T00:00:00.000Z' })))
      .toBe('2026-07-03T00:00:00.000Z')
  })
})

describe('computeNextDue — monthly', () => {
  it('advances by one month', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-06-15T00:00:00.000Z' })))
      .toBe('2026-07-15T00:00:00.000Z')
  })
  it('clamps Jan 31 → Feb 28 (non-leap)', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-01-31T00:00:00.000Z' })))
      .toBe('2026-02-28T00:00:00.000Z')
  })
  it('clamps Jan 31 → Feb 29 in a leap year (2024)', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2024-01-31T00:00:00.000Z' })))
      .toBe('2024-02-29T00:00:00.000Z')
  })
  it('Feb 28 → Mar 28 (does NOT re-extend to 31)', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-02-28T00:00:00.000Z' })))
      .toBe('2026-03-28T00:00:00.000Z')
  })
  it('preserves day-of-month using anchor: Jan 31 → Feb 28 → Mar 31', () => {
    const r = mk({ period: 'monthly', anchor_at: '2026-01-31T00:00:00.000Z', next_due_at: '2026-02-28T00:00:00.000Z' })
    expect(computeNextDue(r)).toBe('2026-03-31T00:00:00.000Z')
  })
  it('advances by N months for interval_count=N', () => {
    expect(computeNextDue(mk({ period: 'monthly', interval_count: 3, next_due_at: '2026-01-15T00:00:00.000Z' })))
      .toBe('2026-04-15T00:00:00.000Z')
  })
})

describe('computeNextDue — yearly', () => {
  it('advances by one year', () => {
    expect(computeNextDue(mk({ period: 'yearly', next_due_at: '2026-06-15T00:00:00.000Z' })))
      .toBe('2027-06-15T00:00:00.000Z')
  })
  it('Feb 29 in a leap year → Feb 28 in a non-leap year', () => {
    expect(computeNextDue(mk({ period: 'yearly', next_due_at: '2024-02-29T00:00:00.000Z' })))
      .toBe('2025-02-28T00:00:00.000Z')
  })
  it('uses anchor=Feb 29 → 2025 → 2026 → 2028 (long path)', () => {
    const r = mk({ period: 'yearly', anchor_at: '2024-02-29T00:00:00.000Z', next_due_at: '2025-02-28T00:00:00.000Z' })
    expect(computeNextDue(r)).toBe('2026-02-28T00:00:00.000Z')
  })
})

describe('computeNextDue — time-of-day preservation', () => {
  it('preserves UTC time-of-day on monthly advance', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-06-15T09:30:00.000Z' })))
      .toBe('2026-07-15T09:30:00.000Z')
  })
})

describe('checkEndConditions', () => {
  it('never-ending rules stay active', () => {
    expect(checkEndConditions(mk({ end_condition_kind: 'never', occurrences_so_far: 999 })))
      .toEqual({ is_active: 1 })
  })

  it('until: deactivates once next_due_at passes end_until', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'until',
      end_until: '2026-12-31T23:59:59.000Z',
      next_due_at: '2027-01-01T00:00:00.000Z',
    }))).toEqual({ is_active: 0 })
  })

  it('until: stays active when next_due_at is before end_until', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'until',
      end_until: '2026-12-31T23:59:59.000Z',
      next_due_at: '2026-06-15T00:00:00.000Z',
    }))).toEqual({ is_active: 1 })
  })

  it('count: deactivates after end_count occurrences', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'count', end_count: 12, occurrences_so_far: 12,
    }))).toEqual({ is_active: 0 })
  })

  it('count: stays active when occurrences_so_far < end_count', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'count', end_count: 12, occurrences_so_far: 5,
    }))).toEqual({ is_active: 1 })
  })
})

describe('property: monotonic advance', () => {
  it('next_due_at > current_due_at for any non-degenerate rule', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('daily', 'weekly', 'monthly', 'yearly'),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2028, 11, 31) }),
        (period, interval, ms) => {
          const r = mk({
            period: period as RecurringRule['period'],
            interval_count: interval,
            anchor_at: new Date(ms).toISOString(),
            next_due_at: new Date(ms).toISOString(),
          })
          const next = computeNextDue(r)
          expect(next > r.next_due_at).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})
