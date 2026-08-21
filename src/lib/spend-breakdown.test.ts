import { describe, it, expect } from 'vitest'
import { computeSpendBreakdown } from './spend-breakdown'
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

const resolve = (id: string | null) =>
  id === 'rent' || id === 'rent-old' ? { name: 'Rent', icon: '🏠' } : id === 'shop' ? { name: 'Shopping', icon: '🛍️' } : null

const toPrimary = (e: MoneyEntryRow) => e.amount

describe('computeSpendBreakdown', () => {
  it('merges same-name ids, computes pct + count, and never phantom-Uncategorizes a resolvable id', () => {
    const b = computeSpendBreakdown(
      [
        row({ id: '1', category_id: 'rent', amount: 1000 }),
        row({ id: '2', category_id: 'rent-old', amount: 500 }), // resolves to Rent
        row({ id: '3', category_id: 'shop', amount: 500 }),
        row({ id: '4', direction: 'in', category_id: null, amount: 2000 }),
      ],
      { resolve, toPrimary },
    )
    expect(b.spend).toBe(2000)
    expect(b.income).toBe(2000)
    expect(b.net).toBe(0)
    const rent = b.rows.find(r => r.name === 'Rent')!
    expect(rent.amount).toBe(1500)
    expect(rent.count).toBe(2)
    expect(rent.pct).toBe(75)
    expect(b.rows.some(r => r.name === 'Uncategorized')).toBe(false)
  })

  it('buckets a truly-null id under Uncategorized', () => {
    const b = computeSpendBreakdown([row({ id: '1', category_id: null, amount: 300 })], { resolve, toPrimary })
    expect(b.rows).toEqual([{ name: 'Uncategorized', icon: null, amount: 300, count: 1, pct: 100 }])
  })
})
