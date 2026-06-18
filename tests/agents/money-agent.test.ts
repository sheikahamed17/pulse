import { describe, it, expect, vi } from 'vitest'
import { parseMoneyEntry } from '@/lib/agents/money-agent'
import { CASES, TEST_CATEGORIES, type Case } from '../fixtures/money-agent-cases'

function makeMockResponseForCase(c: Case) {
  const base = {
    amount: 0, currency: 'INR' as const, direction: 'out' as const,
    category_name: null, description: null,
    occurred_at: '2026-06-18T14:30:00.000Z',
  }
  return { ...base, ...c.expect }
}

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseMoneyEntry — fixture validation (mocked Groq)', () => {
  for (const c of CASES) {
    it(`${c.id} (${c.bucket}): "${c.text}"`, async () => {
      const fake = makeMockResponseForCase(c)
      const client = mockGroqWith(fake)
      const out = await parseMoneyEntry({
        client: client as never,
        text: c.text,
        categories: TEST_CATEGORIES,
        nowIso: '2026-06-18T14:30:00.000Z',
      })

      for (const [k, v] of Object.entries(c.expect)) {
        // @ts-expect-error indexed
        expect(out[k]).toEqual(v)
      }
    })
  }
})
