import { describe, it, expect } from 'vitest'
import {
  computeMoneyBreakdown,
  computeMoneyDelta,
  computeMoneySeries,
  deltaFetchRange,
} from '@/lib/query-money-exec'
import type { MoneyEntryRow, CategoryRow } from '@/lib/dexie'

// Mock category data
const mockCategories: Map<string, CategoryRow> = new Map([
  ['cat-food', {
    id: 'cat-food', user_id: 'user1', name: 'Food', kind: 'spend',
    icon: null, color: null, sort_order: 0, is_archived: 0,
    field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
  }],
  ['cat-transport', {
    id: 'cat-transport', user_id: 'user1', name: 'Transport', kind: 'spend',
    icon: null, color: null, sort_order: 1, is_archived: 0,
    field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
  }],
])

function mockCategoryNameOf(categoryId: string | null): string | null {
  if (!categoryId) return null
  return mockCategories.get(categoryId)?.name ?? null
}

const toPrimary = (entry: MoneyEntryRow) => entry.amount // Already in primary currency

describe('computeMoneyBreakdown', () => {
  it('returns empty array for no entries', () => {
    const result = computeMoneyBreakdown([], { direction: 'out', categoryNameOf: mockCategoryNameOf }, toPrimary)
    expect(result).toEqual([])
  })

  it('filters by direction', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: 'cat-food', description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 5000, currency: 'USD', direction: 'in',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: mockCategoryNameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0].categoryName).toBe('Food')
  })

  it('sorts by amount descending', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 500, currency: 'USD', direction: 'out',
        category_id: 'cat-food', description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: 'cat-transport', description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '3', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: 'cat-food', description: null, occurred_at: '2026-01-02T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: mockCategoryNameOf }, toPrimary)
    expect(result).toHaveLength(2)
    expect(result[0].amount).toBe(2000) // Transport
    expect(result[1].amount).toBe(1500) // Food
  })

  it('aggregates entries by category', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: 'cat-food', description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 500, currency: 'USD', direction: 'out',
        category_id: 'cat-food', description: null, occurred_at: '2026-01-02T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: mockCategoryNameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0].categoryName).toBe('Food')
    expect(result[0].amount).toBe(1500)
  })

  it('includes uncategorized entries', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: mockCategoryNameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0].categoryName).toBeNull()
    expect(result[0].amount).toBe(1000)
  })

  it('merges buckets that resolve to the same name (dupe/tombstoned ids)', () => {
    const entries: MoneyEntryRow[] = [
      { id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out', category_id: 'cat-food', description: null, occurred_at: '2026-01-01T00:00:00Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '' },
      { id: '2', user_id: 'user1', amount: 500, currency: 'USD', direction: 'out', category_id: 'cat-food-old', description: null, occurred_at: '2026-01-01T00:00:00Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '' },
    ]
    const nameOf = (id: string | null) => (id === 'cat-food' || id === 'cat-food-old' ? 'Food' : null)
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: nameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ categoryName: 'Food', amount: 1500 })
  })

  it('keeps a single Uncategorized bucket for null/unresolved ids', () => {
    const entries: MoneyEntryRow[] = [
      { id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out', category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '' },
      { id: '2', user_id: 'user1', amount: 500, currency: 'USD', direction: 'out', category_id: 'ghost', description: null, occurred_at: '2026-01-01T00:00:00Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '' },
    ]
    const nameOf = () => null
    const result = computeMoneyBreakdown(entries, { direction: 'out', categoryNameOf: nameOf }, toPrimary)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ categoryName: null, amount: 1500 })
  })
})

describe('computeMoneyDelta', () => {
  it('returns zero deltas for empty current and previous', () => {
    const result = computeMoneyDelta([], [], 'out', toPrimary)
    expect(result).toEqual({ current: 0, previous: 0, deltaPct: null })
  })

  it('returns null deltaPct when previous is zero', () => {
    const currentEntries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyDelta(currentEntries, [], 'out', toPrimary)
    expect(result.current).toBe(1000)
    expect(result.previous).toBe(0)
    expect(result.deltaPct).toBeNull()
  })

  it('calculates positive delta correctly', () => {
    const currentEntries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const previousEntries: MoneyEntryRow[] = [
      {
        id: '2', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2025-12-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyDelta(currentEntries, previousEntries, 'out', toPrimary)
    expect(result.current).toBe(2000)
    expect(result.previous).toBe(1000)
    expect(result.deltaPct).toBe(100)
  })

  it('calculates negative delta correctly', () => {
    const currentEntries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 500, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const previousEntries: MoneyEntryRow[] = [
      {
        id: '2', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2025-12-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyDelta(currentEntries, previousEntries, 'out', toPrimary)
    expect(result.current).toBe(500)
    expect(result.previous).toBe(1000)
    expect(result.deltaPct).toBe(-50)
  })

  it('filters by direction', () => {
    const currentEntries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '3', user_id: 'user1', amount: 5000, currency: 'USD', direction: 'in',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const previousEntries: MoneyEntryRow[] = [
      {
        id: '2', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2025-12-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneyDelta(currentEntries, previousEntries, 'out', toPrimary)
    expect(result.current).toBe(2000)
    expect(result.previous).toBe(1000)
  })
})

describe('computeMoneySeries', () => {
  it('returns all buckets even with no entries', () => {
    const result = computeMoneySeries([], { from: '2026-01-01T00:00:00Z', to: '2026-01-08T00:00:00Z', bucket: 'day', direction: 'out' }, toPrimary)
    // Should have 7 days of buckets
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(r => r.amount === 0)).toBe(true)
  })

  it('buckets by day correctly', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T10:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 500, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T15:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '3', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-02T10:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneySeries(entries, { from: '2026-01-01T00:00:00Z', to: '2026-01-03T00:00:00Z', bucket: 'day', direction: 'out' }, toPrimary)
    expect(result.length).toBeGreaterThan(0)
    // Find entries for 01-01 and 01-02
    const jan1 = result.find(r => r.label === '2026-01-01')
    const jan2 = result.find(r => r.label === '2026-01-02')
    expect(jan1?.amount).toBe(1500) // 1000 + 500
    expect(jan2?.amount).toBe(2000)
  })

  it('buckets by week correctly', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-08T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneySeries(entries, { from: '2025-12-29T00:00:00Z', to: '2026-01-12T00:00:00Z', bucket: 'week', direction: 'out' }, toPrimary)
    expect(result.length).toBeGreaterThan(0)
    // Should have at least 2 weeks with data
    const withData = result.filter(r => r.amount > 0)
    expect(withData.length).toBeGreaterThanOrEqual(2)
  })

  it('buckets by month correctly', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-15T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-02-15T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneySeries(entries, { from: '2026-01-01T00:00:00Z', to: '2026-03-01T00:00:00Z', bucket: 'month', direction: 'out' }, toPrimary)
    expect(result.length).toBeGreaterThan(0)
    const jan = result.find(r => r.label.includes('2026-01'))
    const feb = result.find(r => r.label.includes('2026-02'))
    expect(jan?.amount).toBe(1000)
    expect(feb?.amount).toBe(2000)
  })

  it('filters by direction', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 5000, currency: 'USD', direction: 'in',
        category_id: null, description: null, occurred_at: '2026-01-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneySeries(entries, { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', bucket: 'day', direction: 'out' }, toPrimary)
    const jan1 = result.find(r => r.label === '2026-01-01')
    expect(jan1?.amount).toBe(1000)
  })

  it('respects period boundaries', () => {
    const entries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2025-12-31T23:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
      {
        id: '2', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-01-02T01:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const result = computeMoneySeries(entries, { from: '2026-01-01T00:00:00Z', to: '2026-01-03T00:00:00Z', bucket: 'day', direction: 'out' }, toPrimary)
    const jan1 = result.find(r => r.label === '2026-01-01')
    // Entry at 2025-12-31T23:00 is outside period (before 2026-01-01T00:00), so jan1 should be 0
    expect(jan1?.amount).toBe(0)
    const jan2 = result.find(r => r.label === '2026-01-02')
    // Entry at 2026-01-02T01:00 is inside period
    expect(jan2?.amount).toBe(2000)
  })
})

describe('deltaFetchRange', () => {
  it('returns current period for total mode', () => {
    const period = { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' }
    const result = deltaFetchRange('total', period)
    expect(result).toEqual(period)
  })

  it('returns current period for breakdown mode', () => {
    const period = { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' }
    const result = deltaFetchRange('breakdown', period)
    expect(result).toEqual(period)
  })

  it('returns current period for series mode', () => {
    const period = { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' }
    const result = deltaFetchRange('series', period)
    expect(result).toEqual(period)
  })

  it('extends fetch range for delta mode to include previous period', () => {
    // Aug 1 to Aug 31 (31 days)
    const period = { from: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }
    const result = deltaFetchRange('delta', period)
    // Should fetch from Jul 1 to Sep 1 (2x the period length)
    expect(result.to).toBe('2026-09-01T00:00:00Z')
    // from should be 31 days before Aug 1, which is Jul 1
    expect(result.from).toBe('2026-07-01T00:00:00.000Z')
  })

  it('correctly calculates delta fetch range for 30-day period', () => {
    const period = { from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' }
    const result = deltaFetchRange('delta', period)
    // 30 days before Jan 1 is Dec 2
    expect(result.from).toBe('2025-12-02T00:00:00.000Z')
    expect(result.to).toBe('2026-01-31T00:00:00Z')
  })

  it('correctly calculates delta fetch range for 7-day period', () => {
    const period = { from: '2026-01-08T00:00:00Z', to: '2026-01-15T00:00:00Z' }
    const result = deltaFetchRange('delta', period)
    // 7 days before Jan 8 is Jan 1
    expect(result.from).toBe('2026-01-01T00:00:00.000Z')
    expect(result.to).toBe('2026-01-15T00:00:00Z')
  })
})

describe('deltaFetchRange with computeMoneyDelta integration', () => {
  it('proves delta works when both windows are fetched', () => {
    // Mock entries with both current and previous period data
    const currentEntries: MoneyEntryRow[] = [
      {
        id: '1', user_id: 'user1', amount: 2000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-08-15T10:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]
    const previousEntries: MoneyEntryRow[] = [
      {
        id: '2', user_id: 'user1', amount: 1000, currency: 'USD', direction: 'out',
        category_id: null, description: null, occurred_at: '2026-07-15T10:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        merchant: null, tags: [],
        field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
      },
    ]

    // Aug 1-31 period
    const period = { from: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }
    const fetchRange = deltaFetchRange('delta', period)

    // Verify the fetch range includes both windows
    expect(new Date(fetchRange.from) <= new Date('2026-07-15T10:00:00Z')).toBe(true)
    expect(new Date(fetchRange.to) >= new Date('2026-08-15T10:00:00Z')).toBe(true)

    // Compute delta with both windows
    const toPrimary = (e: MoneyEntryRow) => e.amount
    const result = computeMoneyDelta(currentEntries, previousEntries, 'out', toPrimary)

    // Verify delta calculation works correctly
    expect(result.current).toBe(2000)
    expect(result.previous).toBe(1000)
    expect(result.deltaPct).toBe(100) // 100% increase
  })
})
