import { describe, it, expect, vi } from 'vitest'
import { parseNotesQuery } from '@/lib/agents/query-notes-agent'
import type { QueryNotesResponse } from '@/lib/agents/schemas/query-notes-response'

const QUERY_TEST_NOW_ISO = '2026-07-20T12:00:00.000Z'
const QUERY_TEST_TZ = 'Asia/Kolkata'

function makeMockResponse(override: Partial<QueryNotesResponse> = {}): QueryNotesResponse {
  const base = {
    search: null,
    tags: [],
    period: null,
  }
  return { ...base, ...override } as QueryNotesResponse
}

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseNotesQuery — mocked Groq', () => {
  it('parses "find my note about wifi" to search term', async () => {
    const response = makeMockResponse({
      search: 'wifi',
      tags: [],
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseNotesQuery({
      client: client as never,
      text: 'find my note about wifi',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBe('wifi')
    expect(out.tags).toEqual([])
    expect(out.period).toBeNull()
  })

  it('parses "notes this week" to period', async () => {
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
    const out = await parseNotesQuery({
      client: client as never,
      text: 'notes this week',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBeNull()
    expect(out.tags).toEqual([])
    expect(out.period?.label).toBe('this week')
  })

  it('parses "notes tagged work" to tags', async () => {
    const response = makeMockResponse({
      search: null,
      tags: ['work'],
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseNotesQuery({
      client: client as never,
      text: 'notes tagged work',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBeNull()
    expect(out.tags).toEqual(['work'])
    expect(out.period).toBeNull()
  })

  it('parses combined search and tags', async () => {
    const response = makeMockResponse({
      search: 'debugging',
      tags: ['work'],
      period: null,
    })
    const client = mockGroqWith(response)
    const out = await parseNotesQuery({
      client: client as never,
      text: 'notes about debugging tagged work',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBe('debugging')
    expect(out.tags).toEqual(['work'])
  })

  it('rejects period with from >= to via Zod refine', async () => {
    const client = mockGroqWith({
      search: null,
      tags: [],
      period: { from: '2026-07-25T00:00:00.000Z', to: '2026-07-20T00:00:00.000Z', label: 'broken' },
    })
    await expect(parseNotesQuery({
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
    const out = await parseNotesQuery({
      client: client as never,
      text: 'all notes',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.search).toBeNull()
  })

  it('defaults tags to empty array when missing', async () => {
    const client = mockGroqWith({
      search: 'wifi',
      // tags intentionally omitted; schema should default to []
      period: null,
    })
    const out = await parseNotesQuery({
      client: client as never,
      text: 'notes about wifi',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.tags).toEqual([])
  })

  it('defaults period to null when missing', async () => {
    const client = mockGroqWith({
      search: null,
      tags: ['personal'],
      // period intentionally omitted; schema should default to null
    })
    const out = await parseNotesQuery({
      client: client as never,
      text: 'notes tagged personal',
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })
    expect(out.period).toBeNull()
  })
})
