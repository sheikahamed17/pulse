import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const fakeDb = {
  selectFrom: (table: string) => {
    if (table === 'user_prefs') {
      return {
        where: () => ({
          selectAll: () => ({
            executeTakeFirst: async () => ({ primary_currency: 'INR', tz: 'Asia/Kolkata' }),
          }),
        }),
      }
    }
    // categories table
    return {
      where: () => ({
        where: () => ({
          where: () => ({
            select: () => ({
              execute: async () => [{ id: 'cat-food', name: 'Food', kind: 'spend' }],
            }),
          }),
        }),
      }),
    }
  },
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
vi.mock('@/lib/agents/task-agent', () => ({
  parseTaskEntry: vi.fn().mockResolvedValue({
    title: 'Call mom', due_at: '2026-06-19T15:00:00.000Z', priority: 'medium',
  }),
}))
vi.mock('@/lib/agents/query-money-agent', () => ({
  parseMoneyQuery: vi.fn().mockResolvedValue({
    direction: 'out', category_name: 'Food', mode: 'total',
    bucket: 'category', period: { from: '2026-06-11T00:00:00.000Z', to: '2026-06-18T00:00:00.000Z', label: 'last week' },
  }),
}))
vi.mock('@/lib/agents/query-task-agent', () => ({
  parseTaskQuery: vi.fn().mockResolvedValue({ status: 'overdue', period: null }),
}))
vi.mock('@/lib/agents/query-learning-agent', () => ({
  parseLearningQuery: vi.fn().mockResolvedValue({ search: 'test', tags: [], period: null }),
}))
vi.mock('@/lib/agents/query-notes-agent', () => ({
  parseNotesQuery: vi.fn().mockResolvedValue({ search: 'test', tags: [], period: null }),
}))

const { POST } = await import('@/app/api/voice/route')

async function consumeSSE(res: Response): Promise<Array<Record<string, unknown>>> {
  if (!res.body) return []
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const events: Array<Record<string, unknown>> = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, nl)
      buf = buf.slice(nl + 2)
      if (raw.startsWith('data: ')) events.push(JSON.parse(raw.slice(6)))
    }
  }
  return events
}

describe('/api/voice (SSE)', () => {
  function multipartReq(blob: Blob): Request {
    const fd = new FormData()
    fd.append('audio', blob, 'voice.webm')
    return new Request('http://x/api/voice', { method: 'POST', body: fd })
  }

  it('emits 4 events in order for a log_money utterance', async () => {
    const res = await POST(multipartReq(new Blob(['fake'], { type: 'audio/webm' })))
    expect(res.headers.get('content-type')).toMatch(/event-stream/)
    const events = await consumeSSE(res)
    expect(events.map(e => e.step)).toEqual(['transcribing', 'transcript', 'parsing', 'payload'])
    expect((events[1] as { text: string }).text).toBe('spent 80 on chai')
    const payload = (events[3] as { payload: { kind: string; amount: number; category_id: string } }).payload
    expect(payload.kind).toBe('money')
    expect(payload.amount).toBe(8000)
    expect(payload.category_id).toBe('cat-food')
  })

  it('routes log_task to task_agent', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'log_task', confidence: 0.93 })

    const res = await POST(multipartReq(new Blob(['fake'])))
    const events = await consumeSSE(res)
    const payload = (events.find(e => e.step === 'payload') as { payload: { kind: string; title: string } }).payload
    expect(payload.kind).toBe('task')
    expect(payload.title).toBe('Call mom')
  })

  it('emits a query_money plan payload for a money question', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_money', confidence: 0.93 })
    const res = await POST(multipartReq(new Blob(['x'], { type: 'audio/webm' })))
    const events = await consumeSSE(res)
    expect(events.map(e => e.step)).toEqual(['transcribing', 'transcript', 'parsing', 'payload'])
    const payload = (events[3] as { payload: { kind: string; mode: string } }).payload
    expect(payload.kind).toBe('query_money')
    expect(payload.mode).toBe('total')
  })

  it('emits a query_task plan payload for a task question', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_task', confidence: 0.9 })
    const res = await POST(multipartReq(new Blob(['x'], { type: 'audio/webm' })))
    const events = await consumeSSE(res)
    const payload = (events[3] as { payload: { kind: string; status: string } }).payload
    expect(payload.kind).toBe('query_task')
    expect(payload.status).toBe('overdue')
  })

  it('emits a query_learning plan payload for a learning question', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_learning', confidence: 0.9 })
    const res = await POST(multipartReq(new Blob(['x'], { type: 'audio/webm' })))
    const events = await consumeSSE(res)
    const payload = (events[3] as { payload: { kind: string; search: string } }).payload
    expect(payload.kind).toBe('query_learning')
    expect(payload.search).toBe('test')
  })

  it('emits a query_notes plan payload for a notes question', async () => {
    const { routeIntent } = await import('@/lib/agents/router')
    ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_notes', confidence: 0.9 })
    const res = await POST(multipartReq(new Blob(['x'], { type: 'audio/webm' })))
    const events = await consumeSSE(res)
    const payload = (events[3] as { payload: { kind: string; search: string } }).payload
    expect(payload.kind).toBe('query_notes')
    expect(payload.search).toBe('test')
  })

  it('returns 401 without session', async () => {
    const { getSession } = await import('@/lib/auth')
    ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST(multipartReq(new Blob(['fake'])))
    expect(res.status).toBe(401)
  })

  it('emits error event when Whisper fails', async () => {
    const { groqWhisper } = await import('@/lib/agents/whisper')
    ;(groqWhisper as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('whisper boom'))

    const res = await POST(multipartReq(new Blob(['fake'])))
    const events = await consumeSSE(res)
    const errEvent = events.find(e => e.step === 'error') as { message: string } | undefined
    expect(errEvent).toBeDefined()
    expect(errEvent!.message).toMatch(/whisper/i)
  })
})
