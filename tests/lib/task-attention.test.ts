import { describe, it, expect } from 'vitest'
import { taskAttention, attentionCopy } from '@/lib/task-attention'
import type { TaskRow } from '@/lib/dexie'

/* eslint-disable @typescript-eslint/no-explicit-any */
const t = (over: Partial<TaskRow>): TaskRow => ({ id: 'x', user_id: 'u', title: 't', due_at: null, priority: 'medium', completed_at: null, source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: [], project_id: null, parent_id: null, nudge_muted_at: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over } as any)

const NOW = '2026-07-23T12:00:00.000Z' // UTC today = 2026-07-23

describe('taskAttention', () => {
  it('splits overdue vs due-today (UTC)', () => {
    const tasks = [
      t({ id: 'a', due_at: '2026-07-22T09:00:00.000Z' }), // yesterday → overdue
      t({ id: 'b', due_at: '2026-07-23T20:00:00.000Z' }), // today → dueToday
      t({ id: 'c', due_at: '2026-07-24T09:00:00.000Z' }), // tomorrow → neither
      t({ id: 'd', due_at: null }),                        // no due → neither
    ]
    expect(taskAttention(tasks, NOW, 'UTC')).toEqual({ dueToday: 1, overdue: 1 })
  })

  it('excludes completed / deleted / muted', () => {
    const tasks = [
      t({ id: 'a', due_at: '2026-07-22T09:00:00.000Z', completed_at: '2026-07-22T10:00:00.000Z' }),
      t({ id: 'b', due_at: '2026-07-22T09:00:00.000Z', deleted_at: '2026-07-22T10:00:00.000Z' }),
      t({ id: 'c', due_at: '2026-07-22T09:00:00.000Z', nudge_muted_at: '2026-07-23T00:00:00.000Z' }),
    ]
    expect(taskAttention(tasks, NOW, 'UTC')).toEqual({ dueToday: 0, overdue: 0 })
  })

  it('is tz-aware: a late-UTC due time is tomorrow in Asia/Kolkata', () => {
    // 2026-07-23T20:00Z = 2026-07-24 01:30 in Kolkata → tomorrow → neither
    const tasks = [t({ id: 'a', due_at: '2026-07-23T20:00:00.000Z' })]
    expect(taskAttention(tasks, NOW, 'Asia/Kolkata')).toEqual({ dueToday: 0, overdue: 0 })
  })
})

describe('attentionCopy', () => {
  it('both', () => { expect(attentionCopy({ dueToday: 2, overdue: 1 })).toBe('2 due today · 1 overdue') })
  it('only due today', () => { expect(attentionCopy({ dueToday: 2, overdue: 0 })).toBe('2 due today') })
  it('only overdue', () => { expect(attentionCopy({ dueToday: 0, overdue: 1 })).toBe('1 overdue') })
  it('none → null', () => { expect(attentionCopy({ dueToday: 0, overdue: 0 })).toBeNull() })
})
