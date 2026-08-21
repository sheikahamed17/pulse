import { describe, it, expect } from 'vitest'
import { filterSortMoney, EMPTY_MONEY_FILTER, monthBounds } from './money-filter-sort'
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
  field_hlcs: {},
  deleted_at: null,
  created_at: '',
  updated_at: '',
  ...o,
})

const resolve = (id: string | null) =>
  id === 'rent' || id === 'rent-old' ? { name: 'Rent', icon: '🏠' } : id === 'shop' ? { name: 'Shopping', icon: '🛍️' } : null

describe('filterSortMoney', () => {
  it('does not crash on legacy rows whose tags field is undefined', () => {
    // Rows created before the merchant+tags migration have no `tags` field.
    const legacy = row({ id: 'legacy', tags: undefined as unknown as string[] })
    // No filter: legacy row passes through untouched.
    expect(filterSortMoney([legacy], EMPTY_MONEY_FILTER, 'date-desc', resolve).map(r => r.id)).toEqual(['legacy'])
    // Tag filter: legacy row (no tags) is excluded, without throwing.
    expect(filterSortMoney([legacy], { ...EMPTY_MONEY_FILTER, tag: 'fun' }, 'date-desc', resolve)).toEqual([])
  })

  it('empty filter returns all in date-desc', () => {
    const rows = [
      row({ id: '1', occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '2', occurred_at: '2026-08-02T00:00:00Z' }),
      row({ id: '3', occurred_at: '2026-08-03T00:00:00Z' }),
    ]
    const out = filterSortMoney(rows, EMPTY_MONEY_FILTER, 'date-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['3', '2', '1'])
    expect(rows).toEqual([
      row({ id: '1', occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '2', occurred_at: '2026-08-02T00:00:00Z' }),
      row({ id: '3', occurred_at: '2026-08-03T00:00:00Z' }),
    ])
  })

  it('filters by resolved category name across dupe ids and sorts amount desc', () => {
    const rows = [
      row({ id: 'a', category_id: 'rent', amount: 100 }),
      row({ id: 'b', category_id: 'rent-old', amount: 300 }),
      row({ id: 'c', category_id: 'shop', amount: 200 }),
    ]
    const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, categoryName: 'Rent' }, 'amount-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['b', 'a'])
  })

  it('filters by source', () => {
    const rows = [
      row({ id: '1', source: 'manual' }),
      row({ id: '2', source: 'sms' }),
      row({ id: '3', source: 'email' }),
    ]
    const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, source: 'sms' }, 'date-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['2'])
  })

  it('filters by direction', () => {
    const rows = [
      row({ id: '1', direction: 'out', occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '2', direction: 'in', occurred_at: '2026-08-02T00:00:00Z' }),
      row({ id: '3', direction: 'out', occurred_at: '2026-08-03T00:00:00Z' }),
    ]
    const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, direction: 'out' }, 'date-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['3', '1'])
  })

  it('filters by date-range: from <= occurred_at < to', () => {
    const rows = [
      row({ id: '1', occurred_at: '2026-07-31T23:59:00Z' }),
      row({ id: '2', occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '3', occurred_at: '2026-08-15T12:00:00Z' }),
      row({ id: '4', occurred_at: '2026-09-01T00:00:00Z' }),
    ]
    const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, from: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }, 'date-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['3', '2'])
  })

  it('sorts by amount-asc', () => {
    const rows = [
      row({ id: '1', amount: 300, occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '2', amount: 100, occurred_at: '2026-08-02T00:00:00Z' }),
      row({ id: '3', amount: 200, occurred_at: '2026-08-03T00:00:00Z' }),
    ]
    const out = filterSortMoney(rows, EMPTY_MONEY_FILTER, 'amount-asc', resolve)
    expect(out.map(r => r.id)).toEqual(['2', '3', '1'])
  })

  it('treats categoryName "Uncategorized" as resolve→null', () => {
    const rows = [
      row({ id: '1', category_id: null, occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '2', category_id: 'rent', occurred_at: '2026-08-02T00:00:00Z' }),
      row({ id: '3', category_id: 'unknown-id', occurred_at: '2026-08-03T00:00:00Z' }),
    ]
    const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, categoryName: 'Uncategorized' }, 'date-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['3', '1'])
  })

  it('filters by tag', () => {
    const rows = [
      row({ id: '1', tags: ['food', 'groceries'], occurred_at: '2026-08-01T00:00:00Z' }),
      row({ id: '2', tags: ['fuel'], occurred_at: '2026-08-02T00:00:00Z' }),
      row({ id: '3', tags: ['food', 'delivery'], occurred_at: '2026-08-03T00:00:00Z' }),
      row({ id: '4', tags: [], occurred_at: '2026-08-04T00:00:00Z' }),
    ]
    const out = filterSortMoney(rows, { ...EMPTY_MONEY_FILTER, tag: 'food' }, 'date-desc', resolve)
    expect(out.map(r => r.id)).toEqual(['3', '1'])
  })

  it('does not mutate input array', () => {
    const rows = [
      row({ id: '1', amount: 300 }),
      row({ id: '2', amount: 100 }),
    ]
    const original = [...rows]
    filterSortMoney(rows, EMPTY_MONEY_FILTER, 'amount-desc', resolve)
    expect(rows).toEqual(original)
  })
})

describe('monthBounds', () => {
  it('computes current month bounds (monthsAgo=0)', () => {
    // 2026-08-15 10:30:00 UTC
    const nowMs = new Date('2026-08-15T10:30:00Z').getTime()
    const { from, to } = monthBounds(nowMs, 0)
    expect(from).toBe('2026-08-01T00:00:00.000Z')
    expect(to).toBe('2026-09-01T00:00:00.000Z')
  })

  it('computes last month bounds (monthsAgo=1)', () => {
    // 2026-08-15 10:30:00 UTC
    const nowMs = new Date('2026-08-15T10:30:00Z').getTime()
    const { from, to } = monthBounds(nowMs, 1)
    expect(from).toBe('2026-07-01T00:00:00.000Z')
    expect(to).toBe('2026-08-01T00:00:00.000Z')
  })

  it('handles year boundary: January current month', () => {
    // 2026-01-15 10:30:00 UTC
    const nowMs = new Date('2026-01-15T10:30:00Z').getTime()
    const { from, to } = monthBounds(nowMs, 0)
    expect(from).toBe('2026-01-01T00:00:00.000Z')
    expect(to).toBe('2026-02-01T00:00:00.000Z')
  })

  it('handles year boundary: January last month (December of previous year)', () => {
    // 2026-01-15 10:30:00 UTC - last month should be 2025-12
    const nowMs = new Date('2026-01-15T10:30:00Z').getTime()
    const { from, to } = monthBounds(nowMs, 1)
    expect(from).toBe('2025-12-01T00:00:00.000Z')
    expect(to).toBe('2026-01-01T00:00:00.000Z')
  })

  it('handles month before January edge case (monthsAgo=2 in January)', () => {
    // 2026-01-15 10:30:00 UTC - 2 months ago = 2025-11
    const nowMs = new Date('2026-01-15T10:30:00Z').getTime()
    const { from, to } = monthBounds(nowMs, 2)
    expect(from).toBe('2025-11-01T00:00:00.000Z')
    expect(to).toBe('2025-12-01T00:00:00.000Z')
  })
})
