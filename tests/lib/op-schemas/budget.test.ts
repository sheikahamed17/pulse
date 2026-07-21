import { describe, it, expect } from 'vitest'
import { BudgetPayloadSchema } from '@/lib/op-schemas/budget'

describe('BudgetPayloadSchema', () => {
  it('accepts a valid budget payload', () => {
    const r = BudgetPayloadSchema.safeParse({ category_id: 'cat-1', amount: 800000, currency: 'INR' })
    expect(r.success).toBe(true)
  })
  it('rejects non-positive amount', () => {
    expect(BudgetPayloadSchema.safeParse({ category_id: 'cat-1', amount: 0, currency: 'INR' }).success).toBe(false)
  })
  it('rejects non-integer amount', () => {
    expect(BudgetPayloadSchema.safeParse({ category_id: 'cat-1', amount: 12.5, currency: 'INR' }).success).toBe(false)
  })
  it('rejects unknown currency', () => {
    expect(BudgetPayloadSchema.safeParse({ category_id: 'cat-1', amount: 100, currency: 'XXX' }).success).toBe(false)
  })
  it('rejects empty category_id', () => {
    expect(BudgetPayloadSchema.safeParse({ category_id: '', amount: 100, currency: 'INR' }).success).toBe(false)
  })
})
