import { describe, it, expect } from 'vitest'
import { withTimeout } from '@/lib/with-timeout'

// An immediate scheduler makes the timeout fire synchronously — no fake timers needed.
const immediate = (fn: () => void) => fn()

describe('withTimeout', () => {
  it('resolves to the value when the promise settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('reg'), 3000)
    expect(result).toBe('reg')
  })

  it('resolves to null when the promise never settles (the serviceWorker.ready hang)', async () => {
    const never = new Promise<string>(() => {}) // never resolves, never rejects
    const result = await withTimeout(never, 3000, immediate)
    expect(result).toBeNull()
  })

  it('resolves to null when the promise rejects (never throws to the caller)', async () => {
    const result = await withTimeout(Promise.reject(new Error('boom')), 3000)
    expect(result).toBeNull()
  })
})
