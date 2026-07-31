import { describe, it, expect } from 'vitest'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'

describe('money source enum', () => {
  it("accepts source 'sms'", () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 50000, currency: 'INR', direction: 'out',
      occurred_at: '2026-07-23T10:00:00.000Z', source: 'sms',
    })
    expect(r.success).toBe(true)
  })
})
