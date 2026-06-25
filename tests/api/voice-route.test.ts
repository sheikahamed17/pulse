import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const fakeDb = {
  selectFrom: () => ({ where: () => ({ where: () => ({ where: () => ({ select: () => ({ execute: async () => [
    { id: 'cat-food', name: 'Food', kind: 'spend' },
  ] }) }) }) }) }),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { GROQ_API_KEY: 'k', DB: null } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

vi.mock('@/lib/agents/whisper', () => ({
  groqWhisper: vi.fn().mockResolvedValue({ transcript: 'spent 80 on chai', duration_ms: 1800 }),
}))
vi.mock('@/lib/agents/router', () => ({
  routeIntent: vi.fn().mockResolvedValue({ intent: 'log_money', confidence: 0.95 }),
}))
vi.mock('@/lib/agents/money-agent', () => ({
  parseMoneyEntry: vi.fn().mockResolvedValue({
    amount: 8000, currency: 'INR', direction: 'out',
    category_name: 'Food', description: 'chai',
    occurred_at: '2026-06-18T14:30:00.000Z',
  }),
}))

const { POST } = await import('@/app/api/voice/route')

describe('/api/voice', () => {
  function makeMultipartReq(blob: Blob): Request {
    const fd = new FormData()
    fd.append('audio', blob, 'voice.webm')
    return new Request('http://x/api/voice', { method: 'POST', body: fd })
  }

  it('round-trips audio → transcript → payload with category_id resolved', async () => {
    const res = await POST(makeMultipartReq(new Blob(['fake'], { type: 'audio/webm' })))
    expect(res.status).toBe(200)
    const body = await res.json() as { transcript: string; payload: { amount: number; category_id: string } }
    expect(body.transcript).toBe('spent 80 on chai')
    expect(body.payload.amount).toBe(8000)
    expect(body.payload.category_id).toBe('cat-food')
  })

  it('returns 401 without a session', async () => {
    const { getSession } = await import('@/lib/auth')
    ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST(makeMultipartReq(new Blob(['fake'])))
    expect(res.status).toBe(401)
  })

  it('returns 400 when audio blob is missing', async () => {
    const fd = new FormData()
    const res = await POST(new Request('http://x/api/voice', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
  })
})
