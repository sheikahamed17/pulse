import { describe, it, expect } from 'vitest'
import { nextRecurringTaskPayload, taskCompletionOps, formatRecurrence } from '@/lib/recurring-task'

const base = { title: 'Water plants', priority: 'medium' as const, recur_period: 'daily' as const, recur_interval: 3 }

describe('nextRecurringTaskPayload', () => {
  it('schedules the next instance interval-periods after completion', () => {
    const next = nextRecurringTaskPayload(base, '2026-07-22T09:00:00.000Z')
    expect(next.due_at).toBe('2026-07-25T09:00:00.000Z') // +3 days
    expect(next.completed_at).toBeNull()
    expect(next.source).toBe('recurring')
    expect(next.title).toBe('Water plants')
    expect(next.priority).toBe('medium')
    expect(next.recur_period).toBe('daily')
    expect(next.recur_interval).toBe(3)
  })

  it('handles weekly / monthly month-end clamp / yearly', () => {
    expect(nextRecurringTaskPayload({ ...base, recur_period: 'weekly', recur_interval: 2 }, '2026-07-22T09:00:00.000Z').due_at)
      .toBe('2026-08-05T09:00:00.000Z')
    expect(nextRecurringTaskPayload({ ...base, recur_period: 'monthly', recur_interval: 1 }, '2026-01-31T09:00:00.000Z').due_at)
      .toBe('2026-02-28T09:00:00.000Z')
    expect(nextRecurringTaskPayload({ ...base, recur_period: 'yearly', recur_interval: 1 }, '2026-07-22T09:00:00.000Z').due_at)
      .toBe('2027-07-22T09:00:00.000Z')
  })
})

describe('taskCompletionOps', () => {
  it('completing a recurring task: clears recur on the finished one + emits the next', () => {
    const r = taskCompletionOps({ completed_at: null, ...base }, '2026-07-22T09:00:00.000Z')
    expect(r.update).toEqual({ completed_at: '2026-07-22T09:00:00.000Z', recur_period: null, recur_interval: null })
    expect(r.next?.due_at).toBe('2026-07-25T09:00:00.000Z')
    expect(r.next?.recur_period).toBe('daily')
  })

  it('completing a NON-recurring task: just marks done, no next', () => {
    const r = taskCompletionOps({ completed_at: null, title: 'x', priority: 'low', recur_period: null, recur_interval: null }, '2026-07-22T09:00:00.000Z')
    expect(r.update).toEqual({ completed_at: '2026-07-22T09:00:00.000Z' })
    expect(r.next).toBeNull()
  })

  it('un-completing (toggle a done task) clears completed_at, no next even if recur set', () => {
    const r = taskCompletionOps({ completed_at: '2026-07-20T00:00:00.000Z', ...base }, '2026-07-22T09:00:00.000Z')
    expect(r.update).toEqual({ completed_at: null })
    expect(r.next).toBeNull()
  })
})

describe('formatRecurrence', () => {
  it('interval 1 → the plain period word', () => {
    expect(formatRecurrence('daily', 1)).toBe('daily')
    expect(formatRecurrence('weekly', 1)).toBe('weekly')
  })
  it('interval > 1 → "every N units"', () => {
    expect(formatRecurrence('daily', 3)).toBe('every 3 days')
    expect(formatRecurrence('weekly', 2)).toBe('every 2 weeks')
    expect(formatRecurrence('yearly', 5)).toBe('every 5 years')
  })
})
