import { describe, it, expect } from 'vitest'
import { recentActivity } from './recent-activity'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'

const moneyRow = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'm1',
  user_id: 'u',
  amount: 100,
  currency: 'USD',
  direction: 'out',
  category_id: null,
  description: 'Coffee',
  occurred_at: '2026-08-21T10:00:00Z',
  source: 'manual',
  receipt_key: null,
  raw_input: null,
  recurring_rule_id: null,
  merchant: null,
  tags: [],
  field_hlcs: {},
  deleted_at: null,
  created_at: '2026-08-21T10:00:00Z',
  updated_at: '',
  ...o,
})

const taskRow = (o: Partial<TaskRow>): TaskRow => ({
  id: 't1',
  user_id: 'u',
  title: 'Review PR',
  due_at: null,
  priority: 'medium',
  completed_at: null,
  source: 'manual',
  raw_input: null,
  recur_period: null,
  recur_interval: null,
  tags: [],
  project_id: null,
  parent_id: null,
  field_hlcs: {},
  deleted_at: null,
  created_at: '2026-08-21T12:00:00Z',
  updated_at: '',
  ...o,
})

const learningRow = (o: Partial<LearningRow>): LearningRow => ({
  id: 'l1',
  user_id: 'u',
  text: 'Learned about React hooks',
  tags: [],
  attribution: null,
  source: 'manual',
  occurred_at: '2026-08-21T14:00:00Z',
  field_hlcs: {},
  deleted_at: null,
  created_at: '2026-08-21T14:00:00Z',
  updated_at: '',
  ...o,
})

const noteRow = (o: Partial<NoteRow>): NoteRow => ({
  id: 'n1',
  user_id: 'u',
  title: 'Meeting notes',
  body: 'Discussed project roadmap',
  tags: [],
  source: 'manual',
  occurred_at: '2026-08-21T16:00:00Z',
  field_hlcs: {},
  deleted_at: null,
  created_at: '2026-08-21T16:00:00Z',
  updated_at: '',
  ...o,
})

describe('recentActivity', () => {
  it('merges all four domains into a single sorted list', () => {
    const data = {
      money: [moneyRow({ id: 'm1', occurred_at: '2026-08-21T10:00:00Z' })],
      tasks: [taskRow({ id: 't1', created_at: '2026-08-21T12:00:00Z' })],
      learnings: [learningRow({ id: 'l1', occurred_at: '2026-08-21T14:00:00Z' })],
      notes: [noteRow({ id: 'n1', occurred_at: '2026-08-21T16:00:00Z' })],
    }
    const result = recentActivity(data, 10)
    expect(result).toHaveLength(4)
    expect(result.map(r => r.id)).toEqual(['n1', 'l1', 't1', 'm1'])
  })

  it('sorts by `at` descending (most recent first)', () => {
    const data = {
      money: [moneyRow({ id: 'm1', occurred_at: '2026-08-21T10:00:00Z' })],
      tasks: [taskRow({ id: 't1', created_at: '2026-08-21T08:00:00Z' })],
      learnings: [learningRow({ id: 'l1', occurred_at: '2026-08-21T12:00:00Z' })],
      notes: [],
    }
    const result = recentActivity(data, 10)
    expect(result.map(r => r.id)).toEqual(['l1', 'm1', 't1'])
  })

  it('respects the limit parameter', () => {
    const data = {
      money: [
        moneyRow({ id: 'm1', occurred_at: '2026-08-21T10:00:00Z' }),
        moneyRow({ id: 'm2', occurred_at: '2026-08-21T11:00:00Z' }),
      ],
      tasks: [
        taskRow({ id: 't1', created_at: '2026-08-21T12:00:00Z' }),
        taskRow({ id: 't2', created_at: '2026-08-21T13:00:00Z' }),
      ],
      learnings: [],
      notes: [],
    }
    const result = recentActivity(data, 2)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.id)).toEqual(['t2', 't1'])
  })

  it('filters out deleted items', () => {
    const data = {
      money: [moneyRow({ id: 'm1', deleted_at: '2026-08-20T00:00:00Z' })],
      tasks: [taskRow({ id: 't1', deleted_at: null })],
      learnings: [],
      notes: [],
    }
    const result = recentActivity(data, 10)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('task')
  })

  it('guards undefined arrays', () => {
    const data = {
      money: undefined as unknown as MoneyEntryRow[],
      tasks: undefined as unknown as TaskRow[],
      learnings: [],
      notes: [noteRow({ id: 'n1' })],
    }
    const result = recentActivity(data, 10)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('note')
  })

  it('handles missing description/title fields gracefully', () => {
    const data = {
      money: [moneyRow({ id: 'm1', description: null, occurred_at: '2026-08-21T10:00:00Z' })],
      tasks: [taskRow({ id: 't1', title: '', created_at: '2026-08-21T11:00:00Z' })],
      learnings: [learningRow({ id: 'l1', text: '', occurred_at: '2026-08-21T12:00:00Z' })],
      notes: [noteRow({ id: 'n1', title: null, body: '', occurred_at: '2026-08-21T13:00:00Z' })],
    }
    const result = recentActivity(data, 10)
    expect(result).toHaveLength(4)
    expect(result[0].label).toBe('(no title)') // note with null title and empty body
    expect(result[1].label).toBe('(no text)') // learning with empty text
    expect(result[2].label).toBe('(no title)') // task with empty title
    expect(result[3].label).toBe('(no description)') // money with null description
  })

  it('handles note without title but with body (uses body slice)', () => {
    const longBody = 'A'.repeat(100)
    const data = {
      money: [],
      tasks: [],
      learnings: [],
      notes: [noteRow({ id: 'n1', title: null, body: longBody })],
    }
    const result = recentActivity(data, 10)
    // Should be first 50 chars of body
    expect(result[0].label).toBe(longBody.slice(0, 50))
  })

  it('returns empty array when no items', () => {
    const data = { money: [], tasks: [], learnings: [], notes: [] }
    const result = recentActivity(data, 10)
    expect(result).toHaveLength(0)
  })

  it('does not mutate input data', () => {
    const money = [moneyRow({ id: 'm1' })]
    const tasks = [taskRow({ id: 't1' })]
    const learnings = [learningRow({ id: 'l1' })]
    const notes = [noteRow({ id: 'n1' })]
    const original = { money: [...money], tasks: [...tasks], learnings: [...learnings], notes: [...notes] }

    recentActivity({ money, tasks, learnings, notes }, 10)

    expect(money).toEqual(original.money)
    expect(tasks).toEqual(original.tasks)
    expect(learnings).toEqual(original.learnings)
    expect(notes).toEqual(original.notes)
  })
})
