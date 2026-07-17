import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { setPin, verifyPin, isPinSet, clearPin, shouldRelock, type PinStore } from '@/lib/pin-lock'

function memStore(): PinStore {
  const m = new Map<string, string>()
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) },
  }
}

describe('pin-lock', () => {
  it('verifies the correct pin and rejects a wrong one', async () => {
    const s = memStore()
    await setPin('1234', s)
    expect(isPinSet(s)).toBe(true)
    expect(await verifyPin('1234', s)).toBe(true)
    expect(await verifyPin('0000', s)).toBe(false)
  })

  it('clearPin removes the stored credential', async () => {
    const s = memStore()
    await setPin('4321', s)
    clearPin(s)
    expect(isPinSet(s)).toBe(false)
    expect(await verifyPin('4321', s)).toBe(false)
  })

  it('uses a unique salt per setPin (same pin → different stored hash)', async () => {
    const a = memStore(); const b = memStore()
    await setPin('1111', a); await setPin('1111', b)
    expect(a.getItem('pulse.pin')).not.toBe(b.getItem('pulse.pin'))
  })

  it('round-trips arbitrary pins', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 32 }), async pin => {
      const s = memStore()
      await setPin(pin, s)
      expect(await verifyPin(pin, s)).toBe(true)
    }), { numRuns: 25 })
    // 25 fast-check runs × two 210k-iteration PBKDF2 derivations each is
    // CPU-heavy; raise the 5s vitest default so it doesn't flake under load.
  }, 30000)

  it('shouldRelock: locked when never active, or when idle beyond the timeout', () => {
    expect(shouldRelock(null, 1000)).toBe(true)
    expect(shouldRelock(1000, 1000 + 60_000)).toBe(false)      // within 5-min default
    expect(shouldRelock(1000, 1000 + 6 * 60_000)).toBe(true)   // beyond 5 min
  })
})
