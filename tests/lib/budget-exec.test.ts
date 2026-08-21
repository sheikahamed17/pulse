import { describe, it, expect } from 'vitest'
import { computeBudgetProgress, yearMonthInTz } from '@/lib/budget-exec'
import type { BudgetRow, MoneyEntryRow } from '@/lib/dexie'

const budget = (over: Partial<BudgetRow> = {}): BudgetRow => ({
  id: 'cat-1', user_id: 'u1', category_id: 'cat-1', amount: 100000, currency: 'INR',
  field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over,
})
const money = (over: Partial<MoneyEntryRow> = {}): MoneyEntryRow => ({
  id: crypto.randomUUID(), user_id: 'u1', amount: 10000, currency: 'INR', direction: 'out',
  category_id: 'cat-1', description: null, occurred_at: '2026-07-10T06:00:00.000Z',
  source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], account_id: null,
  field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '',
  ...over,
} as MoneyEntryRow)

const idToPrimary = (e: MoneyEntryRow) => e.amount   // 1:1 (INR primary)

describe('yearMonthInTz', () => {
  it('returns local year-month in the given tz', () => {
    // 2026-06-30T20:00Z is 2026-07-01 01:30 IST → month 2026-07
    expect(yearMonthInTz('2026-06-30T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-07')
    expect(yearMonthInTz('2026-07-10T06:00:00.000Z', 'Asia/Kolkata')).toBe('2026-07')
  })
})

describe('computeBudgetProgress', () => {
  it('sums out-spend for the category in the month and reports ok/warn/over', () => {
    const budgets = [budget({ amount: 100000 })]
    const entries = [money({ amount: 79000 })]
    const [p] = computeBudgetProgress(entries, budgets, '2026-07', 'Asia/Kolkata', idToPrimary)
    expect(p.spent).toBe(79000)
    expect(p.limit).toBe(100000)
    expect(p.state).toBe('ok')       // 79% < 80
  })
  it('warn at exactly 80%', () => {
    const [p] = computeBudgetProgress([money({ amount: 80000 })], [budget()], '2026-07', 'Asia/Kolkata', idToPrimary)
    expect(p.state).toBe('warn')
  })
  it('over at exactly 100%', () => {
    const [p] = computeBudgetProgress([money({ amount: 100000 })], [budget()], '2026-07', 'Asia/Kolkata', idToPrimary)
    expect(p.state).toBe('over')
  })
  it('excludes other categories, income, tombstones, and other months', () => {
    const entries = [
      money({ amount: 50000, category_id: 'other' }),
      money({ amount: 50000, direction: 'in' }),
      money({ amount: 50000, deleted_at: '2026-07-11T00:00:00.000Z' }),
      money({ amount: 50000, occurred_at: '2026-06-10T06:00:00.000Z' }),
      money({ amount: 30000 }),
    ]
    const [p] = computeBudgetProgress(entries, [budget()], '2026-07', 'Asia/Kolkata', idToPrimary)
    expect(p.spent).toBe(30000)
  })
  it('converts multi-currency spend via toPrimary', () => {
    const entries = [money({ amount: 100, currency: 'USD' })]
    const toPrimary = (e: MoneyEntryRow) => e.currency === 'USD' ? 8300 : e.amount  // $1 → ₹83
    const [p] = computeBudgetProgress(entries, [budget()], '2026-07', 'Asia/Kolkata', toPrimary)
    expect(p.spent).toBe(8300)
  })
  it('reports 0% for a budget with no matching spend', () => {
    const [p] = computeBudgetProgress([], [budget()], '2026-07', 'Asia/Kolkata', idToPrimary)
    expect(p.spent).toBe(0)
    expect(p.state).toBe('ok')
  })
})
