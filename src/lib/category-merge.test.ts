import { describe, it, expect } from 'vitest'
import { planCategoryMerge } from './category-merge'
import type { MoneyEntryRow, RecurringRuleRow, BudgetRow } from '@/lib/dexie'

const money = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'm', user_id: 'u', amount: 100, currency: 'INR', direction: 'out', category_id: null,
  description: null, occurred_at: '', source: 'manual', receipt_key: null, raw_input: null,
  recurring_rule_id: null, merchant: null, tags: [], field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const recurring = (o: Partial<RecurringRuleRow>): RecurringRuleRow => ({
  id: 'r', user_id: 'u', amount: 100, currency: 'INR', direction: 'out', category_id: null,
  description: null, period: 'monthly', interval_count: 1, anchor_at: '', next_due_at: '',
  end_condition_kind: 'never', end_until: null, end_count: null, occurrences_so_far: 0, is_active: 1,
  field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const budget = (o: Partial<BudgetRow>): BudgetRow => ({
  id: 'b', user_id: 'u', category_id: 'b', amount: 0, currency: 'INR',
  field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const EMPTY = { money: [], recurring: [] as RecurringRuleRow[], budgets: [] as BudgetRow[] }

describe('planCategoryMerge', () => {
  it('remaps money entries from source to target', () => {
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, money: [
      money({ id: 'm1', category_id: 'src' }), money({ id: 'm2', category_id: 'other' }), money({ id: 'm3', category_id: 'src' }),
    ]})
    const moneyOps = ops.filter(o => o.entity_kind === 'money')
    expect(moneyOps.map(o => o.entity_id).sort()).toEqual(['m1', 'm3'])
    expect(moneyOps.every(o => o.op_type === 'update' && o.entity_kind === 'money' && o.payload.category_id === 'tgt')).toBe(true)
  })
  it('remaps recurring rules from source to target', () => {
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, recurring: [
      recurring({ id: 'r1', category_id: 'src' }), recurring({ id: 'r2', category_id: 'other' }), recurring({ id: 'r3', category_id: 'src' }),
    ]})
    const recurOps = ops.filter(o => o.entity_kind === 'recurring')
    expect(recurOps.map(o => o.entity_id).sort()).toEqual(['r1', 'r3'])
    expect(recurOps.every(o => o.op_type === 'update' && o.entity_kind === 'recurring' && o.payload.category_id === 'tgt')).toBe(true)
  })
  it('folds budgets keeping the higher cap and tombstones the source budget', () => {
    // source budget 500, target budget 300 → target ends at 500, source deleted
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, budgets: [
      budget({ id: 'src', category_id: 'src', amount: 500 }), budget({ id: 'tgt', category_id: 'tgt', amount: 300 }),
    ]})
    expect(ops).toContainEqual({ entity_kind: 'budget', entity_id: 'src', op_type: 'delete', payload: {} })
    const tgtBudget = ops.find(o => o.entity_kind === 'budget' && o.entity_id === 'tgt')
    expect(tgtBudget).toMatchObject({ op_type: 'update', payload: { category_id: 'tgt', amount: 500, currency: 'INR' } })
  })
  it('moves a source-only budget onto the target (create)', () => {
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, budgets: [budget({ id: 'src', category_id: 'src', amount: 800 })] })
    expect(ops).toContainEqual({ entity_kind: 'budget', entity_id: 'src', op_type: 'delete', payload: {} })
    expect(ops.find(o => o.entity_kind === 'budget' && o.entity_id === 'tgt')).toMatchObject({ op_type: 'create', payload: { category_id: 'tgt', amount: 800, currency: 'INR' } })
  })
  it('always tombstones the source category', () => {
    const ops = planCategoryMerge('src', 'tgt', EMPTY)
    expect(ops).toContainEqual({ entity_kind: 'category', entity_id: 'src', op_type: 'delete', payload: {} })
  })
  it('is a no-op when source === target', () => {
    expect(planCategoryMerge('x', 'x', { ...EMPTY, money: [money({ id: 'm1', category_id: 'x' })] })).toEqual([])
  })
})
