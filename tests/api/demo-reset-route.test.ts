import { describe, it, expect, vi } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'

// DEMO_MODE is UNSET here → the reset must refuse to do anything destructive
// even with a valid cron token. This is the independent safeguard that keeps a
// misconfiguration from ever wiping a non-demo (i.e. production) database.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }),
}))

import { POST } from '@/app/api/cron/demo-reset/route'

function post(auth?: string) {
  return POST(new Request('https://demo/api/cron/demo-reset', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  }))
}

describe('demo-reset route refuses unless DEMO_MODE=true', () => {
  it('403s a VALID cron request when DEMO_MODE is not set (never wipes a non-demo DB)', async () => {
    const res = await post(`Bearer ${TEST_SECRET}`)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error?: string }).error).toBe('not_demo')
  })

  it('403s a request without the cron token', async () => {
    const res = await post()
    expect(res.status).toBe(403)
  })
})
