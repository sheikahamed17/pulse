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

describe('MoneyPayloadSchema receipt fields', () => {
  it('accepts receipt_key when present', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'receipt',
      occurred_at: '2026-06-28T12:00:00.000Z',
      receipt_key: 'user-1/abc-def-ghi.jpg',
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts null receipt_key', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      receipt_key: null,
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts receipt as source', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'receipt',
      occurred_at: '2026-06-28T12:00:00.000Z',
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects empty receipt_key', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'receipt',
      occurred_at: '2026-06-28T12:00:00.000Z',
      receipt_key: '',
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })
})

describe('MoneyPayloadSchema merchant + tags fields', () => {
  it('accepts merchant and tags together', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      merchant: 'CRUNCHYROLL',
      tags: ['subscription', 'fun'],
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts merchant alone', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      merchant: 'ACME Corp',
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts tags alone', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      tags: ['groceries', 'weekly'],
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts null merchant', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      merchant: null,
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects merchant exceeding max 120 chars', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      merchant: 'a'.repeat(121),
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('accepts merchant at max 120 chars', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      merchant: 'a'.repeat(120),
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects tag exceeding max 40 chars', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      tags: ['valid', 'a'.repeat(41)],
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('accepts tag at max 40 chars', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      tags: ['valid', 'a'.repeat(40)],
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects more than 20 tags', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('accepts exactly 20 tags', () => {
    const payload = {
      amount: 10000,
      currency: 'INR',
      direction: 'out',
      source: 'voice',
      occurred_at: '2026-06-28T12:00:00.000Z',
      tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
    }
    const result = MoneyPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
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
