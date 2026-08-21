import { describe, it, expect } from 'vitest'
import { buildBillReminders, LEAD_DAYS } from './bill-reminders'
import type { ForecastEvent } from './forecast'

describe('buildBillReminders', () => {
  it('exports LEAD_DAYS constant', () => {
    expect(LEAD_DAYS).toBe(3)
  })

  it('event due today → when="today", title mentions today, body has amount + description', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-21T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({
      id: 'bill-rule-1-2026-08-21',
      ruleId: 'rule-1',
      dueDate: '2026-08-21',
      title: 'Bill due today',
      url: '/app?tab=money',
    })
    expect(reminders[0].body).toContain('₹500')
    expect(reminders[0].body).toContain('Rent')
  })

  it('event due tomorrow → when="tomorrow"', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-22T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders[0].title).toBe('Bill due tomorrow')
  })

  it('event due in 3 days → when="in 3 days"', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-24T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders[0].title).toBe('Bill due in 3 days')
  })

  it('two events same rule different dates → two distinct ids', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-21T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
      {
        ruleId: 'rule-1',
        date: '2026-09-21T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders).toHaveLength(2)
    expect(reminders[0].id).toBe('bill-rule-1-2026-08-21')
    expect(reminders[1].id).toBe('bill-rule-1-2026-09-21')
  })

  it('same rule same date → same id (dedup)', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-24T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
      {
        ruleId: 'rule-1',
        date: '2026-08-24T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    // Both have the same id, so they would dedup in the DB
    expect(reminders[0].id).toBe(reminders[1].id)
    expect(reminders[0].id).toBe('bill-rule-1-2026-08-24')
  })

  it('amount formatting: 1500000 (₹15,000) INR → body contains "₹15,000"', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-21T00:00:00Z',
        amount: 1500000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders[0].body).toContain('₹15,000')
    expect(reminders[0].body).toContain('Rent')
  })

  it('JPY amount → ÷1 (whole units)', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-21T00:00:00Z',
        amount: 100000,
        currency: 'JPY',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'JPY', (a) => a)
    // JPY ÷1, so 100000 stays 100000
    expect(reminders[0].body).toContain('¥100,000')
    expect(reminders[0].body).toContain('Rent')
  })

  it('event without description → body uses "recurring bill"', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-21T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: null,
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders[0].body).toContain('₹500')
    expect(reminders[0].body).toContain('recurring bill')
  })

  it('daysUntil clamped ≥0 when event is in the past', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-20T00:00:00Z',
        amount: 50000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ]
    const reminders = buildBillReminders(events, now, 'INR', (a) => a)
    expect(reminders[0].title).toBe('Bill due today')
  })

  it('currency conversion via toPrimary', () => {
    const now = '2026-08-21T00:00:00Z'
    const events: ForecastEvent[] = [
      {
        ruleId: 'rule-1',
        date: '2026-08-21T00:00:00Z',
        amount: 100,
        currency: 'USD',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Bill',
      },
    ]
    // Simulate USD → INR conversion at 1:83 rate: 100 USD = 8300 INR, ÷100 = 83 INR
    const reminders = buildBillReminders(events, now, 'INR', (amt, cur) => {
      if (cur === 'USD') return amt * 83
      return amt
    })
    expect(reminders[0].body).toContain('₹83')
    expect(reminders[0].body).toContain('Bill')
  })
})
