import { describe, it, expect } from 'vitest'
import { ingestNotification } from '@/lib/ingest-notification'

describe('ingestNotification', () => {
  it('formats an outgoing INR transaction with a merchant', () => {
    const n = ingestNotification({ amount: 47500, currency: 'INR', direction: 'out', description: 'Crunchyroll' }, 'sms-abc')
    expect(n.title).toBe('💳 ₹475 · Crunchyroll')
    expect(n.body).toBe('Tap to set a category')
    expect(n.url).toBe('/app?categorize=sms-abc')
  })

  it('marks income with 💰 and a + sign, no description', () => {
    const n = ingestNotification({ amount: 200000, currency: 'INR', direction: 'in', description: null }, 'sms-x')
    expect(n.title).toBe('💰 +₹2,000')
  })

  it('does not divide JPY by 100', () => {
    const n = ingestNotification({ amount: 500, currency: 'JPY', direction: 'out', description: null }, 'sms-y')
    expect(n.title).toBe('💳 ¥500')
  })
})
