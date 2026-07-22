import { describe, it, expect } from 'vitest'
import { filterTasksForQuery } from '@/lib/query-task-exec'
import type { TaskRow } from '@/lib/dexie'
import type { QueryTaskPlan } from '@/lib/query-plans'

const mockTasks: TaskRow[] = [
  {
    id: 't1', user_id: 'u1', title: 'Buy milk', priority: 'low',
    due_at: '2026-07-21T10:00:00Z', completed_at: null, deleted_at: null,
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-15T08:00:00Z', updated_at: '2026-07-15T08:00:00Z',
  },
  {
    id: 't2', user_id: 'u1', title: 'Call mom', priority: 'medium',
    due_at: '2026-07-19T14:00:00Z', completed_at: null, deleted_at: null,
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-14T09:00:00Z', updated_at: '2026-07-14T09:00:00Z',
  },
  {
    id: 't3', user_id: 'u1', title: 'Review PR', priority: 'high',
    due_at: '2026-07-18T16:00:00Z', completed_at: '2026-07-18T17:00:00Z', deleted_at: null,
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-16T10:00:00Z', updated_at: '2026-07-18T17:00:00Z',
  },
  {
    id: 't4', user_id: 'u1', title: 'Overdue task', priority: 'high',
    due_at: '2026-07-17T09:00:00Z', completed_at: null, deleted_at: null,
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-10T08:00:00Z', updated_at: '2026-07-10T08:00:00Z',
  },
  {
    id: 't5', user_id: 'u1', title: 'Deleted task', priority: 'low',
    due_at: '2026-07-25T10:00:00Z', completed_at: null, deleted_at: '2026-07-19T12:00:00Z',
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-15T08:00:00Z', updated_at: '2026-07-19T12:00:00Z',
  },
  {
    id: 't6', user_id: 'u1', title: 'No due date', priority: 'medium',
    due_at: null, completed_at: null, deleted_at: null,
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-16T11:00:00Z', updated_at: '2026-07-16T11:00:00Z',
  },
  {
    id: 't7', user_id: 'u1', title: 'Completed no due', priority: 'low',
    due_at: null, completed_at: '2026-07-19T15:00:00Z', deleted_at: null,
    source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
    created_at: '2026-07-17T09:00:00Z', updated_at: '2026-07-19T15:00:00Z',
  },
]

const nowIso = '2026-07-20T12:00:00Z'

describe('filterTasksForQuery', () => {
  describe('status: open', () => {
    it('returns only open tasks (not completed, not deleted)', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual(['t4', 't2', 't1', 't6'])
      // t3 is completed, t5 is deleted
    })

    it('excludes overdue when filtering to open (open = not done)', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.some(t => t.id === 't4')).toBe(true) // t4 is overdue but still open
    })
  })

  describe('status: overdue', () => {
    it('returns only open tasks with due_at < now', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'overdue',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual(['t4', 't2'])
      // t1 is due in future, t6 has no due_at
    })

    it('excludes completed tasks', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'overdue',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.some(t => t.completed_at)).toBe(false)
    })

    it('excludes tasks with no due_at', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'overdue',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.every(t => t.due_at)).toBe(true)
    })

    it('handles exact boundary (due_at === now is not overdue)', () => {
      const taskDueNow: TaskRow = {
        id: 'exact', user_id: 'u1', title: 'Due now', priority: 'medium',
        due_at: nowIso, completed_at: null, deleted_at: null,
        source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, field_hlcs: {},
        created_at: '2026-07-19T08:00:00Z', updated_at: '2026-07-19T08:00:00Z',
      }
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'overdue',
        period: null,
      }
      const result = filterTasksForQuery([taskDueNow], plan, nowIso)
      expect(result).toEqual([])
    })
  })

  describe('status: done', () => {
    it('returns only completed tasks (completed_at is not null)', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'done',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual(['t7', 't3'])
    })

    it('excludes deleted tasks', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'done',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.every(t => !t.deleted_at)).toBe(true)
    })
  })

  describe('status: all', () => {
    it('returns all live tasks (excludes only tombstones)', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'all',
        period: null,
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id).sort()).toEqual(['t1', 't2', 't3', 't4', 't6', 't7'].sort())
      expect(result.some(t => t.deleted_at)).toBe(false)
    })
  })

  describe('period filtering', () => {
    it('filters by period on due_at for open tasks', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: {
          from: '2026-07-21T00:00:00Z',
          to: '2026-07-22T00:00:00Z',
          label: 'tomorrow',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual(['t1'])
    })

    it('excludes tasks due before period', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: {
          from: '2026-07-20T00:00:00Z',
          to: '2026-07-21T00:00:00Z',
          label: 'today',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.some(t => t.due_at && t.due_at < '2026-07-20T00:00:00Z')).toBe(false)
    })

    it('filters by period on created_at for tasks with no due_at', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: {
          from: '2026-07-16T00:00:00Z',
          to: '2026-07-17T00:00:00Z',
          label: 'Jul 16',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.some(t => t.id === 't6')).toBe(true)
    })

    it('respects period exclusive boundary (to is exclusive)', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: {
          from: '2026-07-20T00:00:00Z',
          to: '2026-07-20T10:00:00Z',
          label: 'early morning',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual([])
      // t1 has due_at at 2026-07-20T10:00:00Z, which is not < to
    })
  })

  describe('empty results', () => {
    it('returns empty array when no tasks match', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'overdue',
        period: null,
      }
      const result = filterTasksForQuery([], plan, nowIso)
      expect(result).toEqual([])
    })

    it('returns empty array for period with no matches', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'open',
        period: {
          from: '2026-08-01T00:00:00Z',
          to: '2026-08-02T00:00:00Z',
          label: 'future',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result).toEqual([])
    })
  })

  describe('combined filters (status + period)', () => {
    it('filters done tasks by period', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'done',
        period: {
          from: '2026-07-18T00:00:00Z',
          to: '2026-07-19T00:00:00Z',
          label: 'Jul 18',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual(['t3'])
    })

    it('combines overdue status with period (period on due_at)', () => {
      const plan: QueryTaskPlan = {
        kind: 'query_task',
        status: 'overdue',
        period: {
          from: '2026-07-17T00:00:00Z',
          to: '2026-07-20T00:00:00Z',
          label: 'past days',
        },
      }
      const result = filterTasksForQuery(mockTasks, plan, nowIso)
      expect(result.map(t => t.id)).toEqual(['t4', 't2'])
    })
  })
})
