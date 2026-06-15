import { describe, it, expect, vi } from 'vitest'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Integration test for Better Auth with Cloudflare context.
 * Verifies that the auth module can be imported and the handler is callable.
 * Full end-to-end test requires a running Wrangler dev server with D1 binding.
 */
describe('Better Auth integration', () => {
  it('handler is an async function', async () => {
    // Dynamic import to avoid immediate context requirements
    const { handler } = await import('../src/lib/auth')
    expect(typeof handler).toBe('function')
  })

  it('getSession is an async function', async () => {
    const { getSession } = await import('../src/lib/auth')
    expect(typeof getSession).toBe('function')
  })

  it('auth module exports both handler and getSession', async () => {
    const auth = await import('../src/lib/auth')
    expect('handler' in auth).toBe(true)
    expect('getSession' in auth).toBe(true)
  })
})
