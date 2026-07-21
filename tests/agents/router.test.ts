import { describe, it, expect, vi } from 'vitest'
import { routeIntent } from '@/lib/agents/router'

function mockGroqWithJSON(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('routeIntent', () => {
  it('parses a log_money intent', async () => {
    const client = mockGroqWithJSON({ intent: 'log_money', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'spent 80 on chai' })
    expect(r.intent).toBe('log_money')
    expect(r.confidence).toBeGreaterThan(0.9)
  })

  it('parses a query_money intent', async () => {
    const client = mockGroqWithJSON({ intent: 'query_money', confidence: 0.88 })
    const r = await routeIntent({ client: client as never, text: 'how much did I spend last week' })
    expect(r.intent).toBe('query_money')
  })

  it('parses a chat intent', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 0.7 })
    const r = await routeIntent({ client: client as never, text: 'hi' })
    expect(r.intent).toBe('chat')
  })

  it('rejects unknown intent value', async () => {
    const client = mockGroqWithJSON({ intent: 'something_else', confidence: 0.9 })
    await expect(routeIntent({ client: client as never, text: 'x' })).rejects.toThrow()
  })

  it('rejects out-of-range confidence', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 1.5 })
    await expect(routeIntent({ client: client as never, text: 'x' })).rejects.toThrow()
  })
})

describe('routeIntent — Phase 2 (5 intents)', () => {
  it('parses a log_task intent', async () => {
    const client = mockGroqWithJSON({ intent: 'log_task', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'remind me to call mom tomorrow at 3pm' })
    expect(r.intent).toBe('log_task')
  })

  it('parses a query_task intent', async () => {
    const client = mockGroqWithJSON({ intent: 'query_task', confidence: 0.9 })
    const r = await routeIntent({ client: client as never, text: 'what do I have due this week' })
    expect(r.intent).toBe('query_task')
  })

  it('still rejects unknown intent', async () => {
    const client = mockGroqWithJSON({ intent: 'do_something', confidence: 0.9 })
    await expect(routeIntent({ client: client as never, text: 'x' })).rejects.toThrow()
  })

  it('confidence is bounded [0,1]', async () => {
    const client = mockGroqWithJSON({ intent: 'log_task', confidence: 1.2 })
    await expect(routeIntent({ client: client as never, text: 'x' })).rejects.toThrow()
  })

  it('confidence floor at 0 accepted', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 0 })
    const r = await routeIntent({ client: client as never, text: 'x' })
    expect(r.confidence).toBe(0)
  })
})

describe('routeIntent — all 5 intents reachable via mocked Groq', () => {
  const samples = [
    { intent: 'log_money',   text: 'spent 80 on chai',                              expected: 'log_money' },
    { intent: 'log_task',    text: 'remind me to call mom tomorrow at 3pm',         expected: 'log_task' },
    { intent: 'query_money', text: 'how much did I spend last week',                expected: 'query_money' },
    { intent: 'query_task',  text: 'what do I have due this week',                  expected: 'query_task' },
    { intent: 'chat',        text: 'thanks',                                        expected: 'chat' },
  ]

  for (const s of samples) {
    it(`classifies "${s.text}" as ${s.expected}`, async () => {
      const client = mockGroqWithJSON({ intent: s.intent, confidence: 0.9 })
      const r = await routeIntent({ client: client as never, text: s.text })
      expect(r.intent).toBe(s.expected)
    })
  }
})

describe('routeIntent — Phase 3 (6 intents + learning regression)', () => {
  it('parses a log_learning intent', async () => {
    const client = mockGroqWithJSON({ intent: 'log_learning', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'I learned that the borrow checker prevents data races' })
    expect(r.intent).toBe('log_learning')
  })

  it('classifies another learning example', async () => {
    const client = mockGroqWithJSON({ intent: 'log_learning', confidence: 0.92 })
    const r = await routeIntent({ client: client as never, text: 'TIL TCP is stateful' })
    expect(r.intent).toBe('log_learning')
  })

  it('classifies learning with attribution', async () => {
    const client = mockGroqWithJSON({ intent: 'log_learning', confidence: 0.96 })
    const r = await routeIntent({ client: client as never, text: 'note that I learned monads from a Haskell talk' })
    expect(r.intent).toBe('log_learning')
  })

  it('regression: still classifies log_money correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_money', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'spent 80 on chai' })
    expect(r.intent).toBe('log_money')
  })

  it('regression: still classifies log_task correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_task', confidence: 0.97 })
    const r = await routeIntent({ client: client as never, text: 'remind me to call mom tomorrow at 3pm' })
    expect(r.intent).toBe('log_task')
  })

  it('regression: still classifies query_money correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'query_money', confidence: 0.93 })
    const r = await routeIntent({ client: client as never, text: 'how much did I spend last week' })
    expect(r.intent).toBe('query_money')
  })

  it('regression: still classifies query_task correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'query_task', confidence: 0.92 })
    const r = await routeIntent({ client: client as never, text: 'what do I have due this week' })
    expect(r.intent).toBe('query_task')
  })

  it('regression: still classifies chat correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 0.88 })
    const r = await routeIntent({ client: client as never, text: 'thanks' })
    expect(r.intent).toBe('chat')
  })

  it('all 6 intents reachable', async () => {
    const intents = ['log_money', 'log_task', 'log_learning', 'query_money', 'query_task', 'chat'] as const
    for (const intent of intents) {
      const client = mockGroqWithJSON({ intent, confidence: 0.9 })
      const r = await routeIntent({ client: client as never, text: 'test' })
      expect(r.intent).toBe(intent)
    }
  })
})

describe('routeIntent — Phase 4 (7 intents + note + regression)', () => {
  it('parses a log_note intent', async () => {
    const client = mockGroqWithJSON({ intent: 'log_note', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'note that the wifi password is hunter2' })
    expect(r.intent).toBe('log_note')
  })

  it('classifies another note example', async () => {
    const client = mockGroqWithJSON({ intent: 'log_note', confidence: 0.94 })
    const r = await routeIntent({ client: client as never, text: 'jot down the client\'s new address' })
    expect(r.intent).toBe('log_note')
  })

  it('classifies note with make a note', async () => {
    const client = mockGroqWithJSON({ intent: 'log_note', confidence: 0.96 })
    const r = await routeIntent({ client: client as never, text: 'make a note: call the landlord friday' })
    expect(r.intent).toBe('log_note')
  })

  it('regression: still classifies log_money correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_money', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'spent 80 on chai' })
    expect(r.intent).toBe('log_money')
  })

  it('regression: still classifies log_task correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_task', confidence: 0.97 })
    const r = await routeIntent({ client: client as never, text: 'remind me to call mom tomorrow at 3pm' })
    expect(r.intent).toBe('log_task')
  })

  it('regression: still classifies log_learning correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_learning', confidence: 0.96 })
    const r = await routeIntent({ client: client as never, text: 'I learned that the borrow checker prevents data races' })
    expect(r.intent).toBe('log_learning')
  })

  it('regression: still classifies query_money correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'query_money', confidence: 0.93 })
    const r = await routeIntent({ client: client as never, text: 'how much did I spend last week' })
    expect(r.intent).toBe('query_money')
  })

  it('regression: still classifies query_task correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'query_task', confidence: 0.92 })
    const r = await routeIntent({ client: client as never, text: 'what do I have due this week' })
    expect(r.intent).toBe('query_task')
  })

  it('regression: still classifies chat correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 0.88 })
    const r = await routeIntent({ client: client as never, text: 'thanks' })
    expect(r.intent).toBe('chat')
  })

  it('all 7 intents reachable', async () => {
    const intents = ['log_money', 'log_task', 'log_learning', 'log_note', 'query_money', 'query_task', 'chat'] as const
    for (const intent of intents) {
      const client = mockGroqWithJSON({ intent, confidence: 0.9 })
      const r = await routeIntent({ client: client as never, text: 'test' })
      expect(r.intent).toBe(intent)
    }
  })
})

describe('routeIntent — Phase 5 (9 intents + query_learning + query_notes + regression)', () => {
  it('parses a query_learning intent', async () => {
    const client = mockGroqWithJSON({ intent: 'query_learning', confidence: 0.93 })
    const r = await routeIntent({ client: client as never, text: 'what did I learn about Rust' })
    expect(r.intent).toBe('query_learning')
  })

  it('classifies another learning query example', async () => {
    const client = mockGroqWithJSON({ intent: 'query_learning', confidence: 0.91 })
    const r = await routeIntent({ client: client as never, text: 'show my learnings' })
    expect(r.intent).toBe('query_learning')
  })

  it('classifies learning query about specific topic', async () => {
    const client = mockGroqWithJSON({ intent: 'query_learning', confidence: 0.89 })
    const r = await routeIntent({ client: client as never, text: 'learnings about async programming' })
    expect(r.intent).toBe('query_learning')
  })

  it('parses a query_notes intent', async () => {
    const client = mockGroqWithJSON({ intent: 'query_notes', confidence: 0.94 })
    const r = await routeIntent({ client: client as never, text: 'find my note about the wifi password' })
    expect(r.intent).toBe('query_notes')
  })

  it('classifies another notes query example', async () => {
    const client = mockGroqWithJSON({ intent: 'query_notes', confidence: 0.92 })
    const r = await routeIntent({ client: client as never, text: 'search my notes for project X' })
    expect(r.intent).toBe('query_notes')
  })

  it('classifies notes query with what\'s my note', async () => {
    const client = mockGroqWithJSON({ intent: 'query_notes', confidence: 0.91 })
    const r = await routeIntent({ client: client as never, text: 'what\'s my note about the client meeting' })
    expect(r.intent).toBe('query_notes')
  })

  it('regression: still classifies log_money correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_money', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'spent 80 on chai' })
    expect(r.intent).toBe('log_money')
  })

  it('regression: still classifies log_task correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_task', confidence: 0.97 })
    const r = await routeIntent({ client: client as never, text: 'remind me to call mom tomorrow at 3pm' })
    expect(r.intent).toBe('log_task')
  })

  it('regression: still classifies log_learning correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_learning', confidence: 0.96 })
    const r = await routeIntent({ client: client as never, text: 'I learned that the borrow checker prevents data races' })
    expect(r.intent).toBe('log_learning')
  })

  it('regression: still classifies log_note correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'log_note', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'note that the wifi password is hunter2' })
    expect(r.intent).toBe('log_note')
  })

  it('regression: still classifies query_money correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'query_money', confidence: 0.93 })
    const r = await routeIntent({ client: client as never, text: 'how much did I spend last week' })
    expect(r.intent).toBe('query_money')
  })

  it('regression: still classifies query_task correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'query_task', confidence: 0.92 })
    const r = await routeIntent({ client: client as never, text: 'what do I have due this week' })
    expect(r.intent).toBe('query_task')
  })

  it('regression: still classifies chat correctly', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 0.88 })
    const r = await routeIntent({ client: client as never, text: 'thanks' })
    expect(r.intent).toBe('chat')
  })

  it('all 9 intents reachable', async () => {
    const intents = ['log_money', 'log_task', 'log_learning', 'log_note', 'query_money', 'query_task', 'query_learning', 'query_notes', 'chat'] as const
    for (const intent of intents) {
      const client = mockGroqWithJSON({ intent, confidence: 0.9 })
      const r = await routeIntent({ client: client as never, text: 'test' })
      expect(r.intent).toBe(intent)
    }
  })
})

describe('routeIntent — Phase 6 (10 intents + set_budget + regression)', () => {
  it('parses a set_budget intent', async () => {
    const client = mockGroqWithJSON({ intent: 'set_budget', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'set a budget for food 8000' })
    expect(r.intent).toBe('set_budget')
  })
  it('regression: log_money still classifies', async () => {
    const client = mockGroqWithJSON({ intent: 'log_money', confidence: 0.95 })
    expect((await routeIntent({ client: client as never, text: 'spent 80 on chai' })).intent).toBe('log_money')
  })
  it('all 10 intents reachable', async () => {
    const intents = ['log_money','log_task','log_learning','log_note','query_money','query_task','query_learning','query_notes','chat','set_budget'] as const
    for (const intent of intents) {
      const client = mockGroqWithJSON({ intent, confidence: 0.9 })
      expect((await routeIntent({ client: client as never, text: 'x' })).intent).toBe(intent)
    }
  })
})
