import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { GROQ_API_KEY: 'test', DB: null } }),
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

vi.mock('@/lib/agents/task-agent', () => ({
  parseTaskEntry: vi.fn().mockResolvedValue({
    title: 'Call mom',
    due_at: '2026-06-19T15:00:00.000Z',
    priority: 'medium',
  }),
}))

vi.mock('@/lib/agents/query-money-agent', () => ({
  parseMoneyQuery: vi.fn().mockResolvedValue({
    direction: 'out',
    category_name: null,
    period: { from: '2026-06-11T00:00:00.000Z', to: '2026-06-18T00:00:00.000Z', label: 'last week' },
  }),
}))

vi.mock('@/lib/db', () => ({
  createDb: vi.fn(() => ({
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue({
      primary_currency: 'INR',
      tz: 'Asia/Kolkata',
    }),
  })),
}))

const { POST } = await import('@/app/api/agent/route')

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

  it('calls routeIntent + parseMoneyEntry and resolves category_id', async () => {
    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST',
      body: JSON.stringify({
        text: 'spent 80 on chai',
        categories: [{ id: 'cat-food', name: 'Food', kind: 'spend' }],
      }),
      headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as {
      transcript: string
      intent: string
      confidence: number
      payload: { kind: string; amount: number; category_id: string }
    }
    expect(body.transcript).toBe('spent 80 on chai')
    expect(body.intent).toBe('log_money')
    expect(body.confidence).toBe(0.95)
    expect(body.payload.kind).toBe('money')
    expect(body.payload.amount).toBe(8000)
    expect(body.payload.category_id).toBe('cat-food')
  })
})

describe('/api/agent — Phase 2 log_task dispatch', () => {
  it('routes a task utterance to parseTaskEntry and returns task-shaped payload', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'log_task', confidence: 0.95 })

    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'remind me to call mom tomorrow at 3pm',
        categories: [],
      }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as {
      transcript: string
      intent: string
      confidence: number
      payload: { kind: string; title: string; due_at: string; priority: string; source: string }
    }
    expect(body.intent).toBe('log_task')
    expect(body.payload.kind).toBe('task')
    expect(body.payload.title).toBe('Call mom')
    expect(body.payload.due_at).toBe('2026-06-19T15:00:00.000Z')
    expect(body.payload.priority).toBe('medium')
    expect(body.payload.source).toBe('manual')
  })
})

describe('/api/agent — Phase 2.6 query_money dispatch', () => {
  it('routes a query utterance to parseMoneyQuery and returns query plan', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_money', confidence: 0.93 })

    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'how much did I spend last week', categories: [] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { intent: string; payload: { kind: string; direction: string; period: { label: string } } }
    expect(body.intent).toBe('query_money')
    expect(body.payload.kind).toBe('query_money')
    expect(body.payload.direction).toBe('out')
    expect(body.payload.period.label).toBe('last week')
  })
})
