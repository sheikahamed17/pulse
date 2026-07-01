import { describe, it, expect, vi } from 'vitest'
import { parseMoneyQuery } from '@/lib/agents/query-money-agent'
import {
  QUERY_CASES, QUERY_TEST_NOW_ISO, QUERY_TEST_TZ, QUERY_TEST_CATEGORIES,
  type QueryCase,
} from '../fixtures/query-money-cases'

function makeMockResponseForCase(c: QueryCase) {
  const base = {
    direction: 'out' as const,
    category_name: null as string | null,
    period: {
      from:  '2026-06-15T00:00:00.000Z',
      to:    '2026-06-22T00:00:00.000Z',
      label: c.expect.periodLabel ?? 'this week',
    },
  }
  const merged = { ...base, ...c.expect }
  // Remove periodLabel from the merged top-level (it's nested in period.label)
  delete (merged as Record<string, unknown>).periodLabel
  return merged
}

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseMoneyQuery — fixture validation (mocked Groq)', () => {
  for (const c of QUERY_CASES) {
    it(`${c.id} (${c.bucket}): "${c.text}"`, async () => {
      const fake = makeMockResponseForCase(c)
      const client = mockGroqWith(fake)
      const out = await parseMoneyQuery({
        client: client as never,
        text: c.text,
        categories: QUERY_TEST_CATEGORIES,
        nowIso: QUERY_TEST_NOW_ISO,
        userTz: QUERY_TEST_TZ,
      })
      if (c.expect.direction !== undefined) expect(out.direction).toBe(c.expect.direction)
      if (c.expect.category_name !== undefined) expect(out.category_name).toBe(c.expect.category_name)
      if (c.expect.periodLabel !== undefined) expect(out.period.label).toBe(c.expect.periodLabel)
    })
  }

  it('rejects period with from >= to via Zod refine', async () => {
    const client = mockGroqWith({
      direction: 'out',
      category_name: null,
      period: { from: '2026-06-25T00:00:00.000Z', to: '2026-06-20T00:00:00.000Z', label: 'broken' },
    })
    await expect(parseMoneyQuery({
      client: client as never,
      text: 'broken',
      categories: QUERY_TEST_CATEGORIES,
      nowIso: QUERY_TEST_NOW_ISO,
      userTz: QUERY_TEST_TZ,
    })).rejects.toThrow(/from.*to/i)
  })
})
