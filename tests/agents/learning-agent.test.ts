import { describe, it, expect, vi } from 'vitest'
import { parseLearning } from '@/lib/agents/learning-agent'

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseLearning', () => {
  it('parses a valid learning entry', async () => {
    const response = {
      text: 'The borrow checker prevents data races',
      tags: ['Rust', 'concurrency'],
      attribution: null,
    }
    const client = mockGroqWith(response)
    const out = await parseLearning({
      client: client as never,
      text: 'I learned that the borrow checker prevents data races',
    })

    expect(out.text).toBe('The borrow checker prevents data races')
    expect(out.tags).toEqual(['Rust', 'concurrency'])
    expect(out.attribution).toBeNull()
  })

  it('handles learning with attribution', async () => {
    const response = {
      text: 'TCP is a stateful protocol',
      tags: ['networking', 'TCP'],
      attribution: 'networking course',
    }
    const client = mockGroqWith(response)
    const out = await parseLearning({
      client: client as never,
      text: 'TIL TCP is stateful from the networking course',
    })

    expect(out.text).toBe('TCP is a stateful protocol')
    expect(out.tags).toEqual(['networking', 'TCP'])
    expect(out.attribution).toBe('networking course')
  })

  it('clamps tags to max 12', async () => {
    const response = {
      text: 'Some learning',
      tags: Array(12).fill('tag'),
      attribution: null,
    }
    const client = mockGroqWith(response)
    const out = await parseLearning({
      client: client as never,
      text: 'test',
    })

    expect(out.tags.length).toBe(12)
  })

  it('defaults tags to empty array if missing', async () => {
    const response = {
      text: 'Some learning',
      attribution: null,
    }
    const client = mockGroqWith(response)
    const out = await parseLearning({
      client: client as never,
      text: 'test',
    })

    expect(out.tags).toEqual([])
  })

  it('rejects invalid response with extra fields dropped by schema', async () => {
    const response = {
      text: 'The borrow checker prevents data races',
      tags: ['Rust'],
      attribution: null,
      extra_field: 'should be ignored',
    }
    const client = mockGroqWith(response)
    const out = await parseLearning({
      client: client as never,
      text: 'test',
    })

    // Should parse successfully and ignore extra_field
    expect(out.text).toBe('The borrow checker prevents data races')
    expect(out.tags).toEqual(['Rust'])
  })

  it('rejects missing text field', async () => {
    const response = {
      tags: ['Rust'],
      attribution: null,
    }
    const client = mockGroqWith(response)

    await expect(parseLearning({
      client: client as never,
      text: 'test',
    })).rejects.toThrow('learning_agent: invalid response')
  })

  it('rejects invalid tag type (non-array)', async () => {
    const response = {
      text: 'Some learning',
      tags: 'not-an-array',
      attribution: null,
    }
    const client = mockGroqWith(response)

    await expect(parseLearning({
      client: client as never,
      text: 'test',
    })).rejects.toThrow('learning_agent: invalid response')
  })

  it('rejects text exceeding max length', async () => {
    const response = {
      text: 'x'.repeat(2001),
      tags: ['tag'],
      attribution: null,
    }
    const client = mockGroqWith(response)

    await expect(parseLearning({
      client: client as never,
      text: 'test',
    })).rejects.toThrow('learning_agent: invalid response')
  })
})
