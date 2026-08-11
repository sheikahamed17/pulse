import { describe, it, expect } from 'vitest'
import { sortByDate, sortTasks } from './list-sort'
import type { LearningRow, TaskRow } from '@/lib/dexie'

const learningRow = (o: Partial<LearningRow>): LearningRow => ({
  id: 'x', user_id: 'u', text: 'test', tags: [], attribution: null, source: 'manual',
  occurred_at: '2026-08-01T00:00:00Z', field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})

const taskRow = (o: Partial<TaskRow>): TaskRow => ({
  id: 'x', user_id: 'u', title: 'test', due_at: null, priority: 'medium', completed_at: null,
  tags: [], project_id: null, created_at: '2026-08-01T00:00:00Z', field_hlcs: {},
  deleted_at: null, updated_at: '', source: 'manual', recur_period: null, recur_interval: null,
  parent_id: null, nudge_muted_at: null, raw_input: null, ...o,
})

describe('sortByDate', () => {
  it('sorts newest first (most recent)', () => {
    const rows = [
      learningRow({ id: '1', occurred_at: '2026-08-01T00:00:00Z' }),
      learningRow({ id: '2', occurred_at: '2026-08-05T00:00:00Z' }),
      learningRow({ id: '3', occurred_at: '2026-08-03T00:00:00Z' }),
    ]
    const sorted = sortByDate(rows, 'newest')
    expect(sorted.map(r => r.id)).toEqual(['2', '3', '1'])
  })

  it('sorts oldest first (least recent)', () => {
    const rows = [
      learningRow({ id: '1', occurred_at: '2026-08-01T00:00:00Z' }),
      learningRow({ id: '2', occurred_at: '2026-08-05T00:00:00Z' }),
      learningRow({ id: '3', occurred_at: '2026-08-03T00:00:00Z' }),
    ]
    const sorted = sortByDate(rows, 'oldest')
    expect(sorted.map(r => r.id)).toEqual(['1', '3', '2'])
  })

  it('does not mutate input', () => {
    const rows = [
      learningRow({ id: '1', occurred_at: '2026-08-01T00:00:00Z' }),
      learningRow({ id: '2', occurred_at: '2026-08-05T00:00:00Z' }),
    ]
    const original = rows.map(r => r.id)
    sortByDate(rows, 'newest')
    expect(rows.map(r => r.id)).toEqual(original)
  })
})

describe('sortTasks', () => {
  it('sorts by due date ascending, nulls last', () => {
    const tasks = [
      taskRow({ id: '1', due_at: null }),
      taskRow({ id: '2', due_at: '2026-08-03T00:00:00Z' }),
      taskRow({ id: '3', due_at: '2026-08-01T00:00:00Z' }),
    ]
    const sorted = sortTasks(tasks, 'due')
    expect(sorted.map(r => r.id)).toEqual(['3', '2', '1'])
  })

  it('sorts by created_at descending (newest first)', () => {
    const tasks = [
      taskRow({ id: '1', created_at: '2026-08-01T00:00:00Z' }),
      taskRow({ id: '2', created_at: '2026-08-05T00:00:00Z' }),
      taskRow({ id: '3', created_at: '2026-08-03T00:00:00Z' }),
    ]
    const sorted = sortTasks(tasks, 'created-desc')
    expect(sorted.map(r => r.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by created_at ascending (oldest first)', () => {
    const tasks = [
      taskRow({ id: '1', created_at: '2026-08-01T00:00:00Z' }),
      taskRow({ id: '2', created_at: '2026-08-05T00:00:00Z' }),
      taskRow({ id: '3', created_at: '2026-08-03T00:00:00Z' }),
    ]
    const sorted = sortTasks(tasks, 'created-asc')
    expect(sorted.map(r => r.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by priority (high→medium→low) then by due_at', () => {
    const tasks = [
      taskRow({ id: '1', priority: 'low', due_at: '2026-08-01T00:00:00Z' }),
      taskRow({ id: '2', priority: 'high', due_at: '2026-08-05T00:00:00Z' }),
      taskRow({ id: '3', priority: 'medium', due_at: '2026-08-03T00:00:00Z' }),
      taskRow({ id: '4', priority: 'high', due_at: '2026-08-02T00:00:00Z' }),
    ]
    const sorted = sortTasks(tasks, 'priority')
    expect(sorted.map(r => r.id)).toEqual(['4', '2', '3', '1'])
  })

  it('sorts by priority with nulls last', () => {
    const tasks = [
      taskRow({ id: '1', priority: 'low', due_at: null }),
      taskRow({ id: '2', priority: 'high', due_at: null }),
      taskRow({ id: '3', priority: 'medium', due_at: null }),
    ]
    const sorted = sortTasks(tasks, 'priority')
    expect(sorted.map(r => r.id)).toEqual(['2', '3', '1'])
  })

  it('does not mutate input', () => {
    const tasks = [
      taskRow({ id: '1', priority: 'low' }),
      taskRow({ id: '2', priority: 'high' }),
    ]
    const original = tasks.map(t => t.id)
    sortTasks(tasks, 'priority')
    expect(tasks.map(t => t.id)).toEqual(original)
  })
})
