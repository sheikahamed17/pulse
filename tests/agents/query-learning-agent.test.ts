import { describe, it, expect, vi } from 'vitest'
import { parseLearningQuery } from '@/lib/agents/query-learning-agent'
import type { QueryLearningResponse } from '@/lib/agents/schemas/query-learning-response'

const QUERY_TEST_NOW_ISO = '2026-07-20T12:00:00.000Z'
const QUERY_TEST_TZ = 'Asia/Kolkata'

function makeMockResponse(override: Partial<QueryLearningResponse> = {}): QueryLearningResponse {
  const base = {
    search: null,
    tags: [],
    period: null,
  }
  return { ...base, ...override } as QueryLearningResponse
}

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseLearningQuery — mocked Groq', () => {
  it('parses "what did I learn about Rust" to search term', async () => {
    const response = makeMockResponse({
      search: 'Rust',
      tags: [],
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseLearningQuery({
      client: client as never,
      text: 'what did I learn about Rust',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBe('Rust')
    expect(out.tags).toEqual([])
    expect(out.period).toBeNull()
  })

  it('parses "learnings this week" to period', async () => {
    const response = makeMockResponse({
      search: null,
      tags: [],
      period: {
        from: '2026-07-15T00:00:00.000Z',
        to: '2026-07-22T00:00:00.000Z',
        label: 'this week',
      },
    })
    const client = mockGroqWith(response)
    const out = await parseLearningQuery({
      client: client as never,
      text: 'learnings this week',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBeNull()
    expect(out.tags).toEqual([])
    expect(out.period?.label).toBe('this week')
  })

  it('parses "learnings tagged async" to tags', async () => {
    const response = makeMockResponse({
      search: null,
      tags: ['async'],
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseLearningQuery({
      client: client as never,
      text: 'learnings tagged async',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBeNull()
    expect(out.tags).toEqual(['async'])
    expect(out.period).toBeNull()
  })

  it('parses combined search and tags', async () => {
    const response = makeMockResponse({
      search: 'async',
      tags: ['rust'],
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseLearningQuery({
      client: client as never,
      text: 'learnings about async tagged rust',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBe('async')
    expect(out.tags).toEqual(['rust'])
  })

  it('rejects period with from >= to via Zod refine', async () => {
    const client = mockGroqWith({
      search: null,
      tags: [],
      period: { from: '2026-07-25T00:00:00.000Z', to: '2026-07-20T00:00:00.000Z', label: 'broken' },
    })
    await expect(parseLearningQuery({
      client: client as never,
      text: 'broken',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })).rejects.toThrow(/from.*to/i)
  })

  it('defaults search to null when missing', async () => {
    const client = mockGroqWith({
      // search intentionally omitted; schema should default to null
      tags: [],
      period: null,
    })
    const out = await parseLearningQuery({
      client: client as never,
      text: 'all learnings',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBeNull()
  })

  it('defaults tags to empty array when missing', async () => {
    const client = mockGroqWith({
      search: 'rust',
      // tags intentionally omitted; schema should default to []
      period: null,
    })
    const out = await parseLearningQuery({
      client: client as never,
      text: 'learnings about rust',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.tags).toEqual([])
  })

  it('defaults period to null when missing', async () => {
    const client = mockGroqWith({
      search: null,
      tags: ['work'],
      // period intentionally omitted; schema should default to null
    })
    const out = await parseLearningQuery({
      client: client as never,
      text: 'learnings tagged work',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.period).toBeNull()
  })
})
