import { describe, it, expect } from 'vitest'
import { buildRecurOp, type RecurTemplate } from './recur-emit'

const money: RecurTemplate = { amount: 50000, currency: 'INR', direction: 'out', category_id: 'cat-rent', description: 'Rent' }
const transfer: RecurTemplate = { amount: 100000, currency: 'INR', direction: 'out', category_id: null, description: 'Card payment', from_account_id: 'bank', to_account_id: 'card' }
const DUE = '2026-10-01T00:00:00Z'

describe('buildRecurOp', () => {
  it('emits a money op when the rule has no account pair', () => {
    const op = buildRecurOp(money, 'r1', DUE, 'u1')
    expect(op.entity_kind).toBe('money')
    expect(op.entity_id).toBe('recur-entry-r1-2026-10-01T00:00:00Z')
    expect(op.id).toBe('recur-r1-2026-10-01T00:00:00Z')
    expect(op.payload).toMatchObject({ amount: 50000, direction: 'out', category_id: 'cat-rent', source: 'recurring', recurring_rule_id: 'r1', occurred_at: DUE })
    expect(op.payload.from_account_id).toBeUndefined()
  })

  it('emits a transfer op when BOTH account ids are set (direction ignored)', () => {
    const op = buildRecurOp(transfer, 'r2', DUE, 'u1')
    expect(op.entity_kind).toBe('transfer')
    expect(op.entity_id).toBe('recur-transfer-r2-2026-10-01T00:00:00Z')
    expect(op.payload).toMatchObject({ from_account_id: 'bank', to_account_id: 'card', amount: 100000, currency: 'INR', occurred_at: DUE, note: 'Card payment' })
    // No money-only fields leak onto a transfer payload
    expect(op.payload.direction).toBeUndefined()
    expect(op.payload.source).toBeUndefined()
    expect(op.payload.recurring_rule_id).toBeUndefined()
  })

  it('stays money when only one account id is set', () => {
    expect(buildRecurOp({ ...money, from_account_id: 'bank' }, 'r3', DUE, 'u1').entity_kind).toBe('money')
    expect(buildRecurOp({ ...money, to_account_id: 'card' }, 'r4', DUE, 'u1').entity_kind).toBe('money')
  })

  it('op id is stable per rule+due (dedup key)', () => {
    expect(buildRecurOp(transfer, 'r2', DUE, 'u1').id).toBe(buildRecurOp(transfer, 'r2', DUE, 'u2').id)
  })
})
