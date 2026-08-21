import { describe, it, expect } from 'vitest'
import { goalProgress } from './goals'
import type { GoalLike } from './goals'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { AccountLike } from './accounts'

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

const toAcct = (e: MoneyEntryRow) => e.amount

const account = (o: Partial<AccountLike>): AccountLike => ({
  id: 'a1',
  name: 'Savings',
  type: 'asset',
  opening_balance: 0,
  currency: 'INR',
  icon: null,
  ...o,
})

describe('goalProgress', () => {
  it('manual goal (account_id null, saved_amount 30000, target 50000) => current 30000, pct 60, remaining 20000', () => {
    const goal: GoalLike = {
      id: 'g1',
      name: 'Emergency Fund',
      target_amount: 50000,
      currency: 'INR',
      icon: null,
      account_id: null,
      saved_amount: 30000,
      target_date: null,
    }
    const result = goalProgress(goal, [], [], toAcct)
    expect(result.current).toBe(30000)
    expect(result.pct).toBe(60)
    expect(result.remaining).toBe(20000)
  })

  it('account-linked goal: opening 40000 + in 10000 => 50000; target 50000 => pct 100, remaining 0', () => {
    const acct = account({ id: 'savings1', opening_balance: 40000 })
    const goal: GoalLike = {
      id: 'g1',
      name: 'Holiday Fund',
      target_amount: 50000,
      currency: 'INR',
      icon: null,
      account_id: 'savings1',
      saved_amount: 0,
      target_date: null,
    }
    const entries = [row({ id: '1', account_id: 'savings1', amount: 10000, direction: 'in' })]
    const result = goalProgress(goal, [acct], entries, toAcct)
    expect(result.current).toBe(50000)
    expect(result.pct).toBe(100)
    expect(result.remaining).toBe(0)
  })

  it('pct clamps at 100 when current > target', () => {
    const goal: GoalLike = {
      id: 'g1',
      name: 'Savings',
      target_amount: 30000,
      currency: 'INR',
      icon: null,
      account_id: null,
      saved_amount: 40000,
      target_date: null,
    }
    const result = goalProgress(goal, [], [], toAcct)
    expect(result.current).toBe(40000)
    expect(result.pct).toBe(100)
    expect(result.remaining).toBe(0)
  })

  it('target 0 => pct 0 (no divide-by-zero)', () => {
    const goal: GoalLike = {
      id: 'g1',
      name: 'Test',
      target_amount: 0,
      currency: 'INR',
      icon: null,
      account_id: null,
      saved_amount: 50000,
      target_date: null,
    }
    const result = goalProgress(goal, [], [], toAcct)
    expect(result.current).toBe(50000)
    expect(result.pct).toBe(0)
    expect(result.remaining).toBe(0)
  })

  it('account_id set but account not in accounts => falls back to saved_amount', () => {
    const goal: GoalLike = {
      id: 'g1',
      name: 'Savings',
      target_amount: 50000,
      currency: 'INR',
      icon: null,
      account_id: 'missing-account',
      saved_amount: 25000,
      target_date: null,
    }
    // Pass empty accounts array (account not found)
    const result = goalProgress(goal, [], [], toAcct)
    expect(result.current).toBe(25000)
    expect(result.pct).toBe(50)
    expect(result.remaining).toBe(25000)
  })

  it('does not mutate inputs', () => {
    const goal: GoalLike = {
      id: 'g1',
      name: 'Test',
      target_amount: 50000,
      currency: 'INR',
      icon: null,
      account_id: null,
      saved_amount: 30000,
      target_date: null,
    }
    const originalGoal = { ...goal }
    goalProgress(goal, [], [], toAcct)
    expect(goal).toEqual(originalGoal)
  })
})
