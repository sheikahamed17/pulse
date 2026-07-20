import { describe, it, expect } from 'vitest'
import { searchNotes } from '@/lib/search-notes'
import type { NoteRow } from '@/lib/dexie'

const mockNotes: NoteRow[] = [
  {
    id: '1',
    user_id: 'user1',
    title: 'Meeting Notes',
    body: 'Discussed the project roadmap and timeline.',
    tags: ['work', 'meeting'],
    source: 'voice',
    occurred_at: '2026-07-20T10:00:00.000Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-20T10:00:00.000Z',
    updated_at: '2026-07-20T10:00:00.000Z',
  },
  {
    id: '2',
    user_id: 'user1',
    title: null,
    body: 'Remember to call the dentist tomorrow morning.',
    tags: ['personal'],
    source: 'manual',
    occurred_at: '2026-07-19T15:00:00.000Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-19T15:00:00.000Z',
    updated_at: '2026-07-19T15:00:00.000Z',
  },
  {
    id: '3',
    user_id: 'user1',
    title: 'Recipe',
    body: 'Ingredients: flour, eggs, milk, butter.',
    tags: ['cooking'],
    source: 'manual',
    occurred_at: '2026-07-18T12:00:00.000Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:00:00.000Z',
  },
]

describe('searchNotes', () => {
  it('returns all notes when query is empty', () => {
    const result = searchNotes(mockNotes, '')
    expect(result).toHaveLength(3)
    expect(result).toEqual(mockNotes)
  })

  it('returns all notes when query is whitespace only', () => {
    const result = searchNotes(mockNotes, '   ')
    expect(result).toHaveLength(3)
    expect(result).toEqual(mockNotes)
  })

  it('performs case-insensitive substring match on body', () => {
    const result = searchNotes(mockNotes, 'dentist')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('performs case-insensitive substring match on title', () => {
    const result = searchNotes(mockNotes, 'Recipe')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  it('returns empty array when no notes match', () => {
    const result = searchNotes(mockNotes, 'nonexistent')
    expect(result).toHaveLength(0)
  })

  it('matches case-insensitively across title and body', () => {
    const result = searchNotes(mockNotes, 'MEETING')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('returns multiple notes that match the query', () => {
    const result = searchNotes(mockNotes, 'the')
    expect(result.length).toBeGreaterThan(1)
    expect(result.some(n => n.id === '2')).toBe(true)
  })

  it('trims whitespace from query', () => {
    const result = searchNotes(mockNotes, '  meeting  ')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('handles partial word matches', () => {
    const result = searchNotes(mockNotes, 'flour')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })
})
