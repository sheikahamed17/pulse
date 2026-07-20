import { describe, it, expect, vi } from 'vitest'
import { parseTaskQuery } from '@/lib/agents/query-task-agent'
import type { QueryTaskResponse } from '@/lib/agents/schemas/query-task-response'

const QUERY_TEST_NOW_ISO = '2026-07-20T12:00:00.000Z'
const QUERY_TEST_TZ = 'Asia/Kolkata'

function makeMockResponse(override: Partial<QueryTaskResponse> = {}): QueryTaskResponse {
  const base = {
    status: 'open' as const,
    period: null,
  }
  return { ...base, ...override } as QueryTaskResponse
}

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseTaskQuery — mocked Groq', () => {
  it('parses "what\'s due today" to open status with today period', async () => {
    const response = makeMockResponse({
      status: 'open',
      period: {
        from: '2026-07-20T00:00:00.000Z',
        to: '2026-07-21T00:00:00.000Z',
        label: 'today',
      },
    })
    const client = mockGroqWith(response)
    const out = await parseTaskQuery({
      client: client as never,
      text: "what's due today",
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.status).toBe('open')
    expect(out.period?.label).toBe('today')
  })

  it('parses "overdue" to overdue status', async () => {
    const response = makeMockResponse({
      status: 'overdue',
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseTaskQuery({
      client: client as never,
      text: 'overdue',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.status).toBe('overdue')
    expect(out.period).toBeNull()
  })

  it('parses "what did I finish this week" to done status with week period', async () => {
    const response = makeMockResponse({
      status: 'done',
      period: {
        from: '2026-07-15T00:00:00.000Z',
        to: '2026-07-22T00:00:00.000Z',
        label: 'this week',
      },
    })
    const client = mockGroqWith(response)
    const out = await parseTaskQuery({
      client: client as never,
      text: 'what did I finish this week',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.status).toBe('done')
    expect(out.period?.label).toBe('this week')
  })

  it('parses "all my tasks" to all status', async () => {
    const response = makeMockResponse({
      status: 'all',
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseTaskQuery({
      client: client as never,
      text: 'all my tasks',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.status).toBe('all')
    expect(out.period).toBeNull()
  })

  it('rejects period with from >= to via Zod refine', async () => {
    const client = mockGroqWith({
      status: 'open',
      period: { from: '2026-07-25T00:00:00.000Z', to: '2026-07-20T00:00:00.000Z', label: 'broken' },
    })
    await expect(parseTaskQuery({
      client: client as never,
      text: 'broken',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })).rejects.toThrow(/from.*to/i)
  })

  it('defaults status to open when missing', async () => {
    const client = mockGroqWith({
      // status intentionally omitted; schema should default to 'open'
      period: null,
    })
    const out = await parseTaskQuery({
      client: client as never,
      text: 'my tasks',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.status).toBe('open')
  })

  it('defaults period to null when missing', async () => {
    const client = mockGroqWith({
      status: 'done',
      // period intentionally omitted; schema should default to null
    })
    const out = await parseTaskQuery({
      client: client as never,
      text: 'completed',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.period).toBeNull()
  })
})
