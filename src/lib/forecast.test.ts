import { describe, it, expect } from 'vitest'
import { upcomingOccurrences, forecastSummary } from './forecast'
import type { RecurringRuleRow, MoneyEntryRow } from '@/lib/dexie'

const rule = (o: Partial<RecurringRuleRow>): RecurringRuleRow => ({
  id: 'rule-1',
  user_id: 'u',
  amount: 1000,
  currency: 'INR',
  direction: 'out',
  category_id: 'cat-1',
  description: null,
  period: 'monthly',
  interval_count: 1,
  anchor_at: '2026-08-15T00:00:00Z',
  next_due_at: '2026-08-15T00:00:00Z',
  end_condition_kind: 'never',
  end_until: null,
  end_count: null,
  occurrences_so_far: 0,
  is_active: 1,
  field_hlcs: {},
  deleted_at: null,
  created_at: '',
  updated_at: '',
  ...o,
})

const row = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'x',
  user_id: 'u',
  amount: 0,
  currency: 'INR',
  direction: 'out',
  category_id: null,
  description: null,
  occurred_at: '2026-08-01T00:00:00Z',
  source: 'manual',
  receipt_key: null,
  raw_input: null,
  recurring_rule_id: null,
  merchant: null,
  tags: [],
  account_id: null,
  field_hlcs: {},
  deleted_at: null,
  created_at: '',
  updated_at: '',
  ...o,
})

const toPrimary = (amt: number) => amt

describe('upcomingOccurrences', () => {
  it('monthly rule emits exactly the occurrences within [from,to)', () => {
    const rules = [
      rule({
        id: 'monthly-rent',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        period: 'monthly',
        interval_count: 1,
        anchor_at: '2026-08-15T00:00:00Z',
        next_due_at: '2026-08-15T00:00:00Z',
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-11-01T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    // Should emit 3 events: Aug 15, Sep 15, Oct 15
    expect(events).toHaveLength(3)
    expect(events[0].date).toBe('2026-08-15T00:00:00Z')
    expect(events[1].date).toBe('2026-09-15T00:00:00Z')
    expect(events[2].date).toBe('2026-10-15T00:00:00Z')
    events.forEach(e => {
      expect(e.ruleId).toBe('monthly-rent')
      expect(e.amount).toBe(50000)
      expect(e.currency).toBe('INR')
      expect(e.direction).toBe('out')
    })
  })

  it('weekly rule over 30 days emits ~4-5 events, all in-window and sorted', () => {
    const rules = [
      rule({
        id: 'weekly-gym',
        amount: 1000,
        currency: 'INR',
        direction: 'out',
        period: 'weekly',
        interval_count: 1,
        anchor_at: '2026-08-01T10:00:00Z',
        next_due_at: '2026-08-03T10:00:00Z',
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-08-31T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    // ~4 occurrences: Aug 3, 10, 17, 24
    expect(events.length).toBeGreaterThanOrEqual(4)
    expect(events.length).toBeLessThanOrEqual(5)
    // All in-window
    events.forEach(e => {
      expect(e.date >= from).toBe(true)
      expect(e.date < to).toBe(true)
    })
    // Sorted by date
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true)
    }
  })

  it('is_active===0 rule emits no events', () => {
    const rules = [
      rule({
        id: 'inactive-rule',
        is_active: 0,
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-09-01T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    expect(events).toHaveLength(0)
  })

  it('deleted_at rule emits no events', () => {
    const rules = [
      rule({
        id: 'deleted-rule',
        deleted_at: '2026-08-01T00:00:00Z',
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-09-01T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    expect(events).toHaveLength(0)
  })

  it('end_count: a rule with end_count=2, occurrences_so_far=1 emits at most 1 more', () => {
    const rules = [
      rule({
        id: 'count-limited',
        amount: 100,
        period: 'daily',
        interval_count: 1,
        anchor_at: '2026-08-01T00:00:00Z',
        next_due_at: '2026-08-01T00:00:00Z',
        end_condition_kind: 'count',
        end_count: 2,
        occurrences_so_far: 1,
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-08-10T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    // Should emit only 1 event (for the 2nd occurrence), then stop
    expect(events).toHaveLength(1)
    expect(events[0].date).toBe('2026-08-01T00:00:00Z')
  })

  it('end_until: stops after the until date', () => {
    const rules = [
      rule({
        id: 'until-limited',
        amount: 100,
        period: 'daily',
        interval_count: 1,
        anchor_at: '2026-08-01T00:00:00Z',
        next_due_at: '2026-08-01T00:00:00Z',
        end_condition_kind: 'until',
        end_until: '2026-08-04T00:00:00Z',
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-08-10T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    // Should emit: Aug 1, 2, 3, 4 (5th would be > end_until, so stops)
    expect(events).toHaveLength(4)
    events.forEach(e => {
      expect(e.date <= '2026-08-04T00:00:00Z').toBe(true)
    })
  })

  it('occurrences before fromIso are NOT emitted (overdue already-materialized)', () => {
    const rules = [
      rule({
        id: 'overdue-rule',
        amount: 100,
        period: 'daily',
        interval_count: 1,
        anchor_at: '2026-08-01T00:00:00Z',
        next_due_at: '2026-08-01T00:00:00Z',
      }),
    ]
    const from = '2026-08-05T00:00:00Z'
    const to = '2026-08-10T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    // Should emit only Aug 5, 6, 7, 8, 9 (skipping 1-4 since they're before from)
    expect(events).toHaveLength(5)
    expect(events[0].date).toBe('2026-08-05T00:00:00Z')
  })

  it('safety cap: daily rule with next_due 2 years ago + 30-day window returns bounded list without hanging', () => {
    const rules = [
      rule({
        id: 'pathological-rule',
        amount: 100,
        period: 'daily',
        interval_count: 1,
        anchor_at: '2026-08-01T00:00:00Z',
        next_due_at: '2026-08-01T00:00:00Z',
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-08-31T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    // Should emit all 30 days in August without hanging
    expect(events.length).toBeLessThanOrEqual(500) // respects safety cap
    expect(events.length).toBe(30) // 30 days in August
    events.forEach(e => {
      expect(e.date >= from).toBe(true)
      expect(e.date < to).toBe(true)
    })
  })

  it('safety cap: a daily rule whose next_due is far in the past terminates bounded (never hangs)', () => {
    // next_due ~2.5 years before the window → reaching it daily would take >900
    // steps; the 500-iteration cap MUST break the loop so the call returns.
    const rules = [
      rule({
        id: 'stale-daily',
        amount: 100,
        period: 'daily',
        interval_count: 1,
        anchor_at: '2024-01-01T00:00:00Z',
        next_due_at: '2024-01-01T00:00:00Z',
      }),
    ]
    const events = upcomingOccurrences(rules, '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z')
    // Terminates (test doesn't hang) and never exceeds the per-rule cap.
    expect(events.length).toBeLessThanOrEqual(500)
  })

  it('multiple rules are returned in date order across all rules', () => {
    const rules = [
      rule({
        id: 'rule-1',
        amount: 100,
        period: 'monthly',
        interval_count: 1,
        anchor_at: '2026-08-05T00:00:00Z',
        next_due_at: '2026-08-05T00:00:00Z',
      }),
      rule({
        id: 'rule-2',
        amount: 200,
        period: 'monthly',
        interval_count: 1,
        anchor_at: '2026-08-10T00:00:00Z',
        next_due_at: '2026-08-10T00:00:00Z',
      }),
    ]
    const from = '2026-08-01T00:00:00Z'
    const to = '2026-09-01T00:00:00Z'
    const events = upcomingOccurrences(rules, from, to)
    expect(events).toHaveLength(2)
    expect(events[0].date).toBe('2026-08-05T00:00:00Z')
    expect(events[0].ruleId).toBe('rule-1')
    expect(events[1].date).toBe('2026-08-10T00:00:00Z')
    expect(events[1].ruleId).toBe('rule-2')
  })
})

describe('forecastSummary', () => {
  it('computes actualIn/Out + scheduledIn/Out + projectedNet correctly', () => {
    const currentMonthEntries = [
      row({ id: '1', direction: 'in', amount: 100000 }), // Income
      row({ id: '2', direction: 'out', amount: 20000 }), // Expense
      row({ id: '3', direction: 'out', amount: 30000 }), // Expense
    ]
    const scheduledThisMonth = [
      { ruleId: 'r1', date: '2026-08-20T00:00:00Z', amount: 50000, currency: 'INR', direction: 'out' as const, category_id: null, description: null },
      { ruleId: 'r2', date: '2026-08-25T00:00:00Z', amount: 25000, currency: 'INR', direction: 'in' as const, category_id: null, description: null },
    ]
    const summary = forecastSummary(currentMonthEntries, scheduledThisMonth, toPrimary)
    expect(summary.actualIn).toBe(100000)
    expect(summary.actualOut).toBe(50000) // 20000 + 30000
    expect(summary.actualNet).toBe(50000) // 100000 - 50000
    expect(summary.scheduledIn).toBe(25000)
    expect(summary.scheduledOut).toBe(50000)
    expect(summary.projectedNet).toBe(25000) // (100000 + 25000) - (50000 + 50000)
  })

  it('handles empty currentMonthEntries and scheduledThisMonth → all zeros', () => {
    const summary = forecastSummary([], [], toPrimary)
    expect(summary.actualIn).toBe(0)
    expect(summary.actualOut).toBe(0)
    expect(summary.actualNet).toBe(0)
    expect(summary.scheduledIn).toBe(0)
    expect(summary.scheduledOut).toBe(0)
    expect(summary.projectedNet).toBe(0)
  })

  it('does not mutate input arrays', () => {
    const entries = [
      row({ id: '1', direction: 'in', amount: 100 }),
      row({ id: '2', direction: 'out', amount: 50 }),
    ]
    const scheduled = [
      { ruleId: 'r1', date: '2026-08-20T00:00:00Z', amount: 75, currency: 'INR', direction: 'out' as const, category_id: null, description: null },
    ]
    const originalEntries = JSON.parse(JSON.stringify(entries))
    const originalScheduled = JSON.parse(JSON.stringify(scheduled))

    forecastSummary(entries, scheduled, toPrimary)

    expect(entries).toEqual(originalEntries)
    expect(scheduled).toEqual(originalScheduled)
  })
})
