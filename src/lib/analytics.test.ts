import { describe, it, expect } from 'vitest'
import { analyticsPeriods, computeTopMovers, computeCategorySeries } from './analytics'
import type { MoneyEntryRow } from '@/lib/dexie'

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

describe('analyticsPeriods', () => {
  it('returns N contiguous month buckets ending at the current month, with year rollover', () => {
    const now = Date.parse('2026-01-15T00:00:00Z')
    const p = analyticsPeriods(now, 'month', 3)
    expect(p.map(x => x.from)).toEqual(['2025-11-01T00:00:00.000Z', '2025-12-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'])
    expect(p[2].to).toBe('2026-02-01T00:00:00.000Z')
  })

  it('returns N contiguous week buckets (Monday-aligned)', () => {
    const now = Date.parse('2026-08-13T00:00:00Z') // Thu
    const p = analyticsPeriods(now, 'week', 2)
    expect(p).toHaveLength(2)
    expect(new Date(p[1].from).getUTCDay()).toBe(1) // Monday
    expect(p[0].to).toBe(p[1].from) // contiguous
  })
})

describe('computeTopMovers', () => {
  it('computes delta + deltaPct and sorts by |delta|, resolving names', () => {
    const resolve = (id: string | null) =>
      id === 'food'
        ? { name: 'Food', icon: '🍴' }
        : id === 'rent'
          ? { name: 'Rent', icon: '🏠' }
          : null
    const movers = computeTopMovers(
      [row({ category_id: 'food', amount: 300 }), row({ category_id: 'rent', amount: 1000 })],
      [row({ category_id: 'food', amount: 100 })],
      { resolve, toPrimary: e => e.amount }
    )
    expect(movers[0].name).toBe('Rent') // |Δ|=1000 largest
    expect(movers.find(m => m.name === 'Food')).toMatchObject({ current: 300, previous: 100, delta: 200, deltaPct: 200 })
    expect(movers[0].deltaPct).toBeNull() // previous 0
  })
})

describe('computeCategorySeries', () => {
  it('aligns per-category points to periods and folds beyond topN into Other', () => {
    const periods = analyticsPeriods(Date.parse('2026-02-15T00:00:00Z'), 'month', 2) // Jan, Feb
    const resolve = (id: string | null) => (id ? { name: id, icon: null } : null)
    const s = computeCategorySeries(
      [
        row({ category_id: 'a', amount: 500, occurred_at: '2026-01-10T00:00:00Z' }),
        row({ category_id: 'b', amount: 100, occurred_at: '2026-02-10T00:00:00Z' }),
        row({ category_id: 'c', amount: 10, occurred_at: '2026-02-10T00:00:00Z' }),
      ],
      { periods, resolve, toPrimary: e => e.amount, topN: 2 }
    )
    expect(s.every(x => x.points.length === 2)).toBe(true)
    expect(s.map(x => x.name)).toContain('Other') // 'c' folded
  })
})
