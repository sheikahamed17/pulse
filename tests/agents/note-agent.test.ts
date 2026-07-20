import { describe, it, expect, vi } from 'vitest'
import { parseNote } from '@/lib/agents/note-agent'

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseNote', () => {
  it('parses a valid note entry', async () => {
    const response = {
      title: 'Standup notes',
      tags: ['work'],
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: 'standup notes: discussed Q3 roadmap, blockers with payment API',
    })

    expect(out.title).toBe('Standup notes')
    expect(out.tags).toEqual(['work'])
  })

  it('does NOT return or alter the note body', async () => {
    const response = {
      title: 'Wifi password',
      tags: ['personal'],
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: 'wifi password is hunter2',
    })

    expect(out).not.toHaveProperty('body')
    expect(out).not.toHaveProperty('text')
    expect(out.title).toBe('Wifi password')
    expect(out.tags).toEqual(['personal'])
  })

  it('handles note with multiple tags', async () => {
    const response = {
      title: 'Dentist appointment',
      tags: ['personal', 'health'],
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: 'dentist appt next tuesday at 2pm, bring insurance card',
    })

    expect(out.title).toBe('Dentist appointment')
    expect(out.tags).toEqual(['personal', 'health'])
  })

  it('handles null title for trivially short notes', async () => {
    const response = {
      title: null,
      tags: ['personal'],
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: '123',
    })

    expect(out.title).toBeNull()
    expect(out.tags).toEqual(['personal'])
  })

  it('clamps tags to max 12', async () => {
    const response = {
      title: 'Some note',
      tags: Array(12).fill('tag'),
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: 'test',
    })

    expect(out.tags.length).toBe(12)
  })

  it('defaults tags to empty array if missing', async () => {
    const response = {
      title: 'Some note',
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: 'test',
    })

    expect(out.tags).toEqual([])
  })

  it('rejects invalid response with extra fields dropped by schema', async () => {
    const response = {
      title: 'Wifi password',
      tags: ['personal'],
      extra_field: 'should be ignored',
    }
    const client = mockGroqWith(response)
    const out = await parseNote({
      client: client as never,
      text: 'test',
    })

    // Should parse successfully and ignore extra_field
    expect(out.title).toBe('Wifi password')
    expect(out.tags).toEqual(['personal'])
  })

  it('rejects missing title field', async () => {
    const response = {
      tags: ['personal'],
    }
    const client = mockGroqWith(response)

    await expect(parseNote({
      client: client as never,
      text: 'test',
    })).rejects.toThrow('note_agent: invalid response')
  })

  it('rejects invalid tag type (non-array)', async () => {
    const response = {
      title: 'Some note',
      tags: 'not-an-array',
    }
    const client = mockGroqWith(response)

    await expect(parseNote({
      client: client as never,
      text: 'test',
    })).rejects.toThrow('note_agent: invalid response')
  })

  it('rejects title exceeding max length', async () => {
    const response = {
      title: 'x'.repeat(201),
      tags: ['tag'],
    }
    const client = mockGroqWith(response)

    await expect(parseNote({
      client: client as never,
      text: 'test',
    })).rejects.toThrow('note_agent: invalid response')
  })
})
