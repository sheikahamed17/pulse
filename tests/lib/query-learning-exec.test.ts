import { describe, it, expect } from 'vitest'
import { filterLearningsForQuery } from '@/lib/query-learning-exec'
import type { LearningRow } from '@/lib/dexie'
import type { QueryLearningPlan } from '@/lib/query-plans'

const mockLearnings: LearningRow[] = [
  {
    id: 'l1',
    user_id: 'u1',
    text: 'Rust ownership model is powerful',
    tags: ['rust', 'memory'],
    attribution: 'The Rust Book',
    source: 'manual',
    occurred_at: '2026-07-18T10:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
  },
  {
    id: 'l2',
    user_id: 'u1',
    text: 'Async/await in Rust makes concurrent programming easier',
    tags: ['rust', 'async'],
    attribution: null,
    source: 'manual',
    occurred_at: '2026-07-19T14:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-19T14:00:00Z',
    updated_at: '2026-07-19T14:00:00Z',
  },
  {
    id: 'l3',
    user_id: 'u1',
    text: 'TypeScript generics are useful for reusable components',
    tags: ['typescript', 'generics'],
    attribution: 'Advanced TypeScript course',
    source: 'manual',
    occurred_at: '2026-07-17T09:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-17T09:00:00Z',
    updated_at: '2026-07-17T09:00:00Z',
  },
  {
    id: 'l4',
    user_id: 'u1',
    text: 'Pattern matching in Rust is elegant',
    tags: ['rust', 'patterns'],
    attribution: null,
    source: 'manual',
    occurred_at: '2026-07-20T11:00:00Z',
    field_hlcs: {},
    deleted_at: null,
    created_at: '2026-07-20T11:00:00Z',
    updated_at: '2026-07-20T11:00:00Z',
  },
  {
    id: 'l5',
    user_id: 'u1',
    text: 'Deleted learning about async patterns',
    tags: ['async'],
    attribution: null,
    source: 'manual',
    occurred_at: '2026-07-16T08:00:00Z',
    field_hlcs: {},
    deleted_at: '2026-07-19T12:00:00Z',
    created_at: '2026-07-16T08:00:00Z',
    updated_at: '2026-07-19T12:00:00Z',
  },
]

describe('filterLearningsForQuery', () => {
  describe('search filter', () => {
    it('returns learnings matching search in text (case-insensitive)', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'rust',
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l4', 'l2', 'l1'])
      // Sorted by occurred_at desc
    })

    it('handles uppercase search', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'RUST',
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.length).toBe(3)
    })

    it('searches in attribution field', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'Rust Book',
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l1'])
    })

    it('finds partial matches', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'async',
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l2'])
      // l5 is deleted
    })
  })

  describe('tag filter', () => {
    it('returns learnings with any of the specified tags', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: ['rust'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l4', 'l2', 'l1'])
    })

    it('matches multiple tags (OR logic)', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: ['typescript', 'async'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l2', 'l3'])
      // l1, l4 have rust but not typescript or async (l2 has async)
    })

    it('excludes learnings without matching tags', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: ['nonexistent'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result).toEqual([])
    })

    it('empty tags array matches all', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.length).toBe(4) // Excludes deleted l5
    })
  })

  describe('period filter', () => {
    it('filters by period on occurred_at', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: [],
        period: {
          from: '2026-07-19T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'last 2 days',
        },
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l4', 'l2'])
    })

    it('respects period exclusive boundary (to is exclusive)', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: [],
        period: {
          from: '2026-07-18T00:00:00Z',
          to: '2026-07-19T14:00:00Z',
          label: 'specific range',
        },
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l1'])
      // l2 is at 2026-07-19T14:00:00Z which is not < to
    })

    it('excludes learnings before period', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: [],
        period: {
          from: '2026-07-19T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'recent',
        },
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.every(l => l.occurred_at >= '2026-07-19T00:00:00Z')).toBe(true)
    })
  })

  describe('combined filters', () => {
    it('combines search and tags (AND logic)', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'rust',
        tags: ['async'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l2'])
      // Only l2 has "rust" in text AND "async" in tags
    })

    it('combines search, tags, and period', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'rust',
        tags: ['rust'],
        period: {
          from: '2026-07-19T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'recent',
        },
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l4', 'l2'])
    })

    it('returns empty when search does not match any tags', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'typescript',
        tags: ['rust'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('excludes deleted learnings', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: ['async'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.some(l => l.id === 'l5')).toBe(false)
    })

    it('returns all live learnings when no filters applied', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result.map(l => l.id)).toEqual(['l4', 'l2', 'l1', 'l3'])
      // Sorted by occurred_at desc, excludes deleted l5
    })

    it('returns empty array when empty input', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'rust',
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery([], plan)
      expect(result).toEqual([])
    })

    it('returns empty when no matches', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: 'nonexistent',
        tags: [],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      expect(result).toEqual([])
    })

    it('sorts results by occurred_at descending', () => {
      const plan: QueryLearningPlan = {
        kind: 'query_learning',
        search: null,
        tags: ['rust'],
        period: null,
      }
      const result = filterLearningsForQuery(mockLearnings, plan)
      const dates = result.map(l => l.occurred_at)
      expect(dates).toEqual([...dates].sort().reverse())
    })
  })
})
