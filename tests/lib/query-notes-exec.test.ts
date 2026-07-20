import { describe, it, expect } from 'vitest'
import { filterNotesForQuery } from '@/lib/query-notes-exec'
import type { NoteRow } from '@/lib/dexie'
import type { QueryNotesPlan } from '@/lib/query-plans'

const mockNotes: NoteRow[] = [
  {
    id: 'n1',
    user_id: 'u1',
    title: 'Rust Notes',
    body: 'Ownership model is powerful',
    tags: ['rust', 'memory'],
    source: 'manual',
    occurred_at: '2026-07-18T10:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
  },
  {
    id: 'n2',
    user_id: 'u1',
    title: 'Async Patterns',
    body: 'Async/await in Rust makes concurrent programming easier',
    tags: ['rust', 'async'],
    source: 'manual',
    occurred_at: '2026-07-19T14:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-19T14:00:00Z',
    updated_at: '2026-07-19T14:00:00Z',
  },
  {
    id: 'n3',
    user_id: 'u1',
    title: null,
    body: 'TypeScript generics are useful for reusable components',
    tags: ['typescript', 'generics'],
    source: 'manual',
    occurred_at: '2026-07-17T09:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-17T09:00:00Z',
    updated_at: '2026-07-17T09:00:00Z',
  },
  {
    id: 'n4',
    user_id: 'u1',
    title: 'Pattern Matching',
    body: 'Pattern matching in Rust is elegant',
    tags: ['rust', 'patterns'],
    source: 'manual',
    occurred_at: '2026-07-20T11:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-20T11:00:00Z',
    updated_at: '2026-07-20T11:00:00Z',
  },
  {
    id: 'n5',
    user_id: 'u1',
    title: 'Deleted Note',
    body: 'Deleted note about async patterns',
    tags: ['async'],
    source: 'manual',
    occurred_at: '2026-07-16T08:00:00Z',
    field_hlcs: {},
    deleted_at: '2026-07-19T12:00:00Z',
    created_at: '2026-07-16T08:00:00Z',
    updated_at: '2026-07-19T12:00:00Z',
  },
]

describe('filterNotesForQuery', () => {
  describe('search filter', () => {
    it('returns notes matching search in body (case-insensitive)', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'rust',
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n4', 'n2', 'n1'])
      // Sorted by occurred_at desc
    })

    it('handles uppercase search', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'RUST',
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.length).toBe(3)
    })

    it('searches in title field', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'Rust Notes',
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n1'])
    })

    it('finds partial matches in body', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'async',
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n2'])
      // n5 is deleted
    })
  })

  describe('tag filter', () => {
    it('returns notes with any of the specified tags', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: ['rust'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n4', 'n2', 'n1'])
    })

    it('matches multiple tags (OR logic)', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: ['typescript', 'async'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n2', 'n3'])
      // n1, n4 have rust but not typescript or async (n2 has async)
    })

    it('excludes notes without matching tags', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: ['nonexistent'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result).toEqual([])
    })

    it('empty tags array matches all', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.length).toBe(4) // Excludes deleted n5
    })
  })

  describe('period filter', () => {
    it('filters by period on occurred_at', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: [],
        period: {
          from: '2026-07-19T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'last 2 days',
        },
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n4', 'n2'])
    })

    it('respects period exclusive boundary (to is exclusive)', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: [],
        period: {
          from: '2026-07-18T00:00:00Z',
          to: '2026-07-19T14:00:00Z',
          label: 'specific range',
        },
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n1'])
      // n2 is at 2026-07-19T14:00:00Z which is not < to
    })

    it('excludes notes before period', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: [],
        period: {
          from: '2026-07-19T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'recent',
        },
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.every(n => n.occurred_at >= '2026-07-19T00:00:00Z')).toBe(true)
    })
  })

  describe('combined filters', () => {
    it('combines search and tags (AND logic)', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'rust',
        tags: ['async'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n2'])
      // Only n2 has "rust" in body AND "async" in tags
    })

    it('combines search, tags, and period', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'rust',
        tags: ['rust'],
        period: {
          from: '2026-07-19T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'recent',
        },
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n4', 'n2'])
    })

    it('returns empty when search does not match any tags', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'typescript',
        tags: ['rust'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('excludes deleted notes', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: ['async'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.some(n => n.id === 'n5')).toBe(false)
    })

    it('returns all live notes when no filters applied', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result.map(n => n.id)).toEqual(['n4', 'n2', 'n1', 'n3'])
      // Sorted by occurred_at desc, excludes deleted n5
    })

    it('returns empty array when empty input', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'rust',
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery([], plan)
      expect(result).toEqual([])
    })

    it('returns empty when no matches', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: 'nonexistent',
        tags: [],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      expect(result).toEqual([])
    })

    it('sorts results by occurred_at descending', () => {
      const plan: QueryNotesPlan = {
        kind: 'query_notes',
        search: null,
        tags: ['rust'],
        period: null,
      }
      const result = filterNotesForQuery(mockNotes, plan)
      const dates = result.map(n => n.occurred_at)
      expect(dates).toEqual([...dates].sort().reverse())
    })
  })
})
