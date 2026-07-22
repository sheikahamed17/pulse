import { describe, it, expect } from 'vitest'
import { pushTestMessage } from '@/lib/push-test-message'

describe('pushTestMessage', () => {
  it('one device (singular)', () => {
    expect(pushTestMessage({ ok: true, subscriptions: 1, sent: 1, pruned: 0 }))
      .toBe('Sent to 1 device — you should see a 🔔 shortly.')
  })
  it('multiple devices + pruned suffix', () => {
    expect(pushTestMessage({ ok: true, subscriptions: 3, sent: 2, pruned: 1 }))
      .toBe('Sent to 2 devices — you should see a 🔔 shortly. 1 stale removed.')
  })
  it('no subscriptions → hint, else fallback', () => {
    expect(pushTestMessage({ ok: false, subscriptions: 0, sent: 0, pruned: 0, hint: 'enable first' })).toBe('enable first')
    expect(pushTestMessage({ ok: false, subscriptions: 0, sent: 0, pruned: 0 }))
      .toBe('No subscribed devices — enable notifications first.')
  })
  it('subs but none delivered → advise re-enable', () => {
    expect(pushTestMessage({ ok: false, subscriptions: 2, sent: 0, pruned: 2 })).toMatch(/re-enable/i)
  })
})
