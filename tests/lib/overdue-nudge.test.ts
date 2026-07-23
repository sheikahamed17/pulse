import { describe, it, expect } from 'vitest'
import { localDayKey, overdueNudge } from '@/lib/overdue-nudge'

describe('localDayKey', () => {
  it('rolls a UTC-evening instant into the next day in Asia/Kolkata (+5:30)', () => {
    expect(localDayKey('2026-07-23T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-07-24')
  })
  it('keeps the same day in UTC', () => {
    expect(localDayKey('2026-07-23T12:00:00.000Z', 'UTC')).toBe('2026-07-23')
  })
})

describe('overdueNudge', () => {
  const now = '2026-07-23T12:00:00.000Z' // today (UTC) = 2026-07-23

  it('returns null when the task has no due date', () => {
    expect(overdueNudge({ id: 't', title: 'x', due_at: null }, now, 'UTC')).toBeNull()
  })
  it('returns null when due today (no day-0 double with the due notification)', () => {
    expect(overdueNudge({ id: 't', title: 'x', due_at: '2026-07-23T01:00:00.000Z' }, now, 'UTC')).toBeNull()
  })
  it('nudges when overdue since yesterday', () => {
    const n = overdueNudge({ id: 't1', title: 'Pay rent', due_at: '2026-07-22T09:00:00.000Z' }, now, 'UTC')
    expect(n).toEqual({ notifId: 'overdue-t1-2026-07-23', title: 'Task overdue: Pay rent', body: 'Overdue 1 day' })
  })
  it('pluralizes days overdue', () => {
    const n = overdueNudge({ id: 't2', title: 'Call', due_at: '2026-07-20T09:00:00.000Z' }, now, 'UTC')
    expect(n?.body).toBe('Overdue 3 days')
  })
  it('returns null when muted', () => {
    expect(overdueNudge({ id: 't', title: 'x', due_at: '2026-07-20T09:00:00.000Z', nudge_muted_at: '2026-07-23T00:00:00.000Z' }, now, 'UTC')).toBeNull()
  })
})
