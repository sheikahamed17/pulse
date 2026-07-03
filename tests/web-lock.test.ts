import { describe, it, expect, afterEach, vi } from 'vitest'
import { withWebLock } from '@/lib/web-lock'

describe('withWebLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('runs fn directly when navigator.locks is unavailable (Node fallback)', async () => {
    // vitest environment is 'node' — navigator.locks is absent, so withWebLock
    // takes the fallback branch and runs fn directly.
    const fn = vi.fn().mockResolvedValue(undefined)
    await withWebLock('test-lock', fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('runs fn when the lock is granted', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn(
      async (_name: string, _opts: object, cb: (lock: object | null) => Promise<void>) => {
        await cb({ name: 'test-lock' })
      },
    )
    // vi.stubGlobal defines the global safely — a direct `global.navigator = …`
    // assignment throws under Node, where navigator is a read-only getter.
    vi.stubGlobal('navigator', { locks: { request } })

    await withWebLock('test-lock', fn)

    expect(request).toHaveBeenCalledWith('test-lock', { ifAvailable: true }, expect.any(Function))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('skips fn when the lock is not available (callback receives null)', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn(
      async (_name: string, _opts: object, cb: (lock: object | null) => Promise<void>) => {
        await cb(null) // ifAvailable=true but lock held elsewhere → null.
      },
    )
    vi.stubGlobal('navigator', { locks: { request } })

    await withWebLock('test-lock', fn)

    expect(fn).not.toHaveBeenCalled()
  })
})
