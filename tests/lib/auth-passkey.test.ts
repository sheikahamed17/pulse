import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      DB: {} as unknown,
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://pulse.sdsheikahamed.workers.dev',
    },
  }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => ({}) }))

describe('auth with passkey plugin', () => {
  beforeEach(() => vi.resetModules())

  it('instantiates and exposes passkey generate-options endpoints', async () => {
    const { handler } = await import('@/lib/auth')
    // A GET to a passkey route should be handled (not 404) by the plugin.
    const res = await handler(new Request(
      'https://pulse.sdsheikahamed.workers.dev/api/auth/passkey/generate-register-options',
    ))
    expect(res.status).not.toBe(404)
    // Full Better Auth instantiation (+ passkey/SimpleWebAuthn) is slow to
    // import; raise the 5s vitest default so it doesn't flake under load.
  }, 30000)
})
