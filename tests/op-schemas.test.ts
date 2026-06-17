import { describe, it, expect } from 'vitest'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'
import { RecurringPayloadSchema } from '@/lib/op-schemas/recurring'
import { CategoryPayloadSchema } from '@/lib/op-schemas/category'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'

describe('MoneyPayloadSchema', () => {
  it('accepts a minimal valid create payload', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 8000, currency: 'INR', direction: 'out',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(true)
  })

  it('rejects negative amount', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: -1, currency: 'INR', direction: 'out',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-ISO-4217 currency', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 100, currency: 'XX', direction: 'out',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects bad direction', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 100, currency: 'INR', direction: 'sideways',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('accepts partial update payload', () => {
    const r = MoneyPayloadSchema.partial().safeParse({ description: 'updated note' })
    expect(r.success).toBe(true)
  })
})

describe('RecurringPayloadSchema', () => {
  it('accepts a monthly rule', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 2500000, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 1,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'never',
      is_active: 1,
    })
    expect(r.success).toBe(true)
  })

  it('rejects interval_count of 0', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 1, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 0,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'never',
      is_active: 1,
    })
    expect(r.success).toBe(false)
  })

  it('requires end_until when end_condition_kind=until', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 1, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 1,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'until',
      is_active: 1,
    })
    expect(r.success).toBe(false)
  })

  it('requires end_count when end_condition_kind=count', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 1, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 1,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'count',
      is_active: 1,
      // end_count omitted — refine should reject
    })
    expect(r.success).toBe(false)
  })
})

describe('CategoryPayloadSchema', () => {
  it('accepts a minimal spend category', () => {
    const r = CategoryPayloadSchema.safeParse({
      name: 'Food', kind: 'spend', sort_order: 0,
    })
    expect(r.success).toBe(true)
  })

  it('rejects empty name', () => {
    const r = CategoryPayloadSchema.safeParse({
      name: '', kind: 'spend', sort_order: 0,
    })
    expect(r.success).toBe(false)
  })
})

describe('getPayloadSchemaForKind dispatcher', () => {
  it('returns the right schema per entity_kind', () => {
    expect(getPayloadSchemaForKind('money')).toBe(MoneyPayloadSchema)
    expect(getPayloadSchemaForKind('recurring')).toBe(RecurringPayloadSchema)
    expect(getPayloadSchemaForKind('category')).toBe(CategoryPayloadSchema)
  })

  it('returns null for kinds without a schema (e.g. widget)', () => {
    expect(getPayloadSchemaForKind('widget')).toBeNull()
  })
})
