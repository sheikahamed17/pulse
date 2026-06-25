import { describe, it, expect, vi } from 'vitest'
import { parseTaskEntry } from '@/lib/agents/task-agent'
import { TASK_CASES, TEST_NOW_ISO, TEST_TZ, type TaskCase } from '../fixtures/task-agent-cases'

function makeMockResponseForCase(c: TaskCase) {
  const base = {
    title: 'untitled',
    due_at: null as string | null,
    priority: 'medium' as const,
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

describe('parseTaskEntry — fixture validation (mocked Groq)', () => {
  for (const c of TASK_CASES) {
    it(`${c.id} (${c.bucket}): "${c.text}"`, async () => {
      const fake = makeMockResponseForCase(c)
      const client = mockGroqWith(fake)
      const out = await parseTaskEntry({
        client: client as never,
        text: c.text,
        nowIso: TEST_NOW_ISO,
        userTz: TEST_TZ,
      })
      for (const [k, v] of Object.entries(c.expect)) {
        // @ts-expect-error indexed
        expect(out[k]).toEqual(v)
      }
    })
  }
})
