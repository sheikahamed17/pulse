import { describe, it, expect } from 'vitest'
import { smsToMoneyPayload, smsEntityId, smsOpId } from '@/lib/sms-ingest'

describe('smsToMoneyPayload', () => {
  it('maps a debit transaction to a money payload', () => {
    const p = smsToMoneyPayload(
      { is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' },
      'INR', '2026-07-23T10:00:00.000Z', 'Rs.500 debited ... AMAZON',
    )
    expect(p).toEqual({
      amount: 50000, currency: 'INR', direction: 'out', category_id: null,
      description: 'AMAZON', occurred_at: '2026-07-23T10:00:00.000Z', source: 'sms',
      raw_input: 'Rs.500 debited ... AMAZON',
    })
  })

  it('defaults currency to primary and direction to out when absent', () => {
    const p = smsToMoneyPayload({ is_transaction: true, amount: 100 }, 'USD', '2026-07-23T10:00:00.000Z', 't')
    expect(p?.currency).toBe('USD')
    expect(p?.direction).toBe('out')
    expect(p?.description).toBeNull()
  })

  it('returns null for a non-transaction or missing amount', () => {
    expect(smsToMoneyPayload({ is_transaction: false }, 'INR', '2026-07-23T10:00:00.000Z', 'OTP is 1234')).toBeNull()
    expect(smsToMoneyPayload({ is_transaction: true }, 'INR', '2026-07-23T10:00:00.000Z', 'x')).toBeNull()
  })

  it("uses the source arg when given (email), defaults to sms", () => {
    const email = smsToMoneyPayload(
      { is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' },
      'INR', '2026-07-31T10:00:00.000Z', 'debited Rs.500 AMAZON', 'email',
    )
    expect(email?.source).toBe('email')
    const dflt = smsToMoneyPayload(
      { is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' },
      'INR', '2026-07-31T10:00:00.000Z', 'debited Rs.500 AMAZON',
    )
    expect(dflt?.source).toBe('sms')
  })
})

describe('dedup ids', () => {
  it('are deterministic per (userId, text) and prefixed', async () => {
    const e1 = await smsEntityId('u1', 'hello')
    const e2 = await smsEntityId('u1', 'hello')
    const e3 = await smsEntityId('u1', 'world')
    expect(e1).toBe(e2)
    expect(e1).not.toBe(e3)
    expect(e1.startsWith('sms-')).toBe(true)
    expect((await smsOpId('u1', 'hello')).startsWith('smsop-')).toBe(true)
  })
})
