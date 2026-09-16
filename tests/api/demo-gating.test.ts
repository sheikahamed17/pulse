import { describe, it, expect, vi } from 'vitest'

// DEMO_MODE=true for this whole file.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, DEMO_MODE: 'true' } }),
}))

import { getSession } from '@/lib/auth'
import { POST as pushSubscribe } from '@/app/api/push/subscribe/route'
import { POST as ingestToken } from '@/app/api/ingest/token/route'

const post = (body?: string) => new Request('https://demo/x', { method: 'POST', body: body ?? '{}' })

describe('DEMO_MODE=true auto-authenticates the fixed demo user (no login/signup)', () => {
  it('getSession returns the fixed demo user without any real sign-in', async () => {
    const s = await getSession(new Request('https://demo/x'))
    expect(s?.user?.id).toBe('demo-user')
  })
})

describe('DEMO_MODE=true disables sensitive endpoints (defense in depth)', () => {
  it('push subscribe → disabled_in_demo', async () => {
    const res = await pushSubscribe(post())
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error?: string }).error).toBe('disabled_in_demo')
  })

  it('ingest token → disabled_in_demo', async () => {
    const res = await ingestToken(post())
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error?: string }).error).toBe('disabled_in_demo')
  })
})
