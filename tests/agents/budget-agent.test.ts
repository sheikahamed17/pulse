import { describe, it, expect, vi } from 'vitest'
import { parseBudget } from '@/lib/agents/budget-agent'

function mockGroq(json: object) {
  return { chat: { completions: { create: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(json) } }],
  }) } } }
}

const cats = [{ name: 'Food', kind: 'spend' as const }, { name: 'Salary', kind: 'income' as const }]

describe('parseBudget', () => {
  it('parses a valid budget (minor units)', async () => {
    const client = mockGroq({ category_name: 'Food', amount: 800000, currency: 'INR' })
    const r = await parseBudget({ client: client as never, text: 'set a budget for food 8000', categories: cats, defaultCurrency: 'INR' })
    expect(r.category_name).toBe('Food')
    expect(r.amount).toBe(800000)
    expect(r.currency).toBe('INR')
  })
  it('rejects malformed output', async () => {
    const client = mockGroq({ category_name: 'Food', amount: -5, currency: 'INR' })
    await expect(parseBudget({ client: client as never, text: 'x', categories: cats, defaultCurrency: 'INR' })).rejects.toThrow()
  })
})
