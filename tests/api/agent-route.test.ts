import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/agent/route'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { GROQ_API_KEY: 'test', DB: null } }),
}))

describe('/api/agent', () => {
  it('returns 401 without a session', async () => {
    const { getSession } = await import('@/lib/auth')
    ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST', body: JSON.stringify({ text: 'spent 80 on chai' }),
      headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid body', async () => {
    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(400)
  })

  it('echoes a parsed-payload shape (stub mode for Task 12)', async () => {
    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST',
      body: JSON.stringify({ text: 'spent 80 on chai', categories: [] }),
      headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { transcript: string; intent: string; payload: unknown }
    expect(body.transcript).toBe('spent 80 on chai')
  })
})
