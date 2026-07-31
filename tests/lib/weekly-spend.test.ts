import { describe, it, expect } from 'vitest'
import { weeklySpendBars } from '@/lib/weekly-spend'
import type { MoneyEntryRow } from '@/lib/dexie'

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-07-23T12:00:00.000Z'
const e = (over: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'x', user_id: 'u', amount: 0, currency: 'INR', direction: 'out', category_id: null,
  description: null, occurred_at: NOW, source: 'manual', receipt_key: null, raw_input: null,
  recurring_rule_id: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over,
} as any)

function bars(entries: MoneyEntryRow[]) {
  return weeklySpendBars(entries, 'INR', [], {}, NOW)
}

describe('weeklySpendBars', () => {
  it('buckets this-week and ~10-day-old into the right indices', () => {
    const b = bars([
      e({ amount: 5000, occurred_at: '2026-07-23T00:00:00.000Z' }), // ~12h old → current week (last)
      e({ amount: 3000, occurred_at: '2026-07-13T12:00:00.000Z' }), // 10 days old → w=1 → index 6
    ])
    expect(b).toHaveLength(8)
    expect(b[7]).toBe(5000)
    expect(b[6]).toBe(3000)
    expect(b.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('ignores income (direction in)', () => {
    const b = bars([e({ amount: 9000, direction: 'in', occurred_at: NOW })])
    expect(b[7]).toBe(0)
  })

  it('excludes entries older than the window or in the future, and deleted', () => {
    const b = bars([
      e({ amount: 1000, occurred_at: '2026-05-01T00:00:00.000Z' }), // >8 weeks → excluded
      e({ amount: 2000, occurred_at: '2026-08-01T00:00:00.000Z' }), // future → excluded
      e({ amount: 4000, occurred_at: NOW, deleted_at: '2026-07-23T13:00:00.000Z' }), // deleted → excluded
    ])
    expect(b).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('skips a foreign-currency entry with no FX rate available', () => {
    const b = bars([e({ amount: 5000, currency: 'USD', occurred_at: NOW })])
    expect(b[7]).toBe(0)
  })
})
