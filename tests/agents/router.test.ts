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
