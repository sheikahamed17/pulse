import { describe, it, expect } from 'vitest'
import { lastWorkingDayOfMonth, isSalaryReminderDay, buildSalaryReminder, localDay } from './salary-reminder'

describe('lastWorkingDayOfMonth', () => {
  it('returns the last day when the month ends on a weekday (Aug 2026 → Mon 31)', () => {
    expect(lastWorkingDayOfMonth(2026, 8)).toBe('2026-08-31')
    expect(lastWorkingDayOfMonth(2026, 7)).toBe('2026-07-31') // Fri
  })

  it('rolls back to Friday when the month ends on Saturday (Jan/Oct 2026)', () => {
    expect(lastWorkingDayOfMonth(2026, 1)).toBe('2026-01-30') // 31st is Sat
    expect(lastWorkingDayOfMonth(2026, 10)).toBe('2026-10-30') // 31st is Sat
  })

  it('rolls back to Friday when the month ends on Sunday (May 2026)', () => {
    expect(lastWorkingDayOfMonth(2026, 5)).toBe('2026-05-29') // 31st is Sun
  })

  it('handles February (Feb 2026 ends Sat 28 → Fri 27)', () => {
    expect(lastWorkingDayOfMonth(2026, 2)).toBe('2026-02-27')
  })
})

describe('isSalaryReminderDay', () => {
  it('true on the last working day, in the user tz', () => {
    // 03:00Z on Aug 31 == 08:30 IST on Aug 31 (the last working day)
    expect(isSalaryReminderDay('2026-08-31T03:00:00Z', 'Asia/Kolkata')).toBe(true)
  })

  it('false on any other day', () => {
    expect(isSalaryReminderDay('2026-08-28T03:00:00Z', 'Asia/Kolkata')).toBe(false) // Fri, but not last
    expect(isSalaryReminderDay('2026-08-30T03:00:00Z', 'Asia/Kolkata')).toBe(false) // Sun
  })

  it('is tz-aware at the day boundary', () => {
    // 20:00Z on Aug 31 == 01:30 IST on SEP 1 → Aug's last-working-day has passed
    expect(isSalaryReminderDay('2026-08-31T20:00:00Z', 'Asia/Kolkata')).toBe(false)
    // Same instant in UTC is still Aug 31 (a weekday, and Aug's last working day)
    expect(isSalaryReminderDay('2026-08-31T20:00:00Z', 'UTC')).toBe(true)
  })
})

describe('localDay', () => {
  it('formats the tz-local calendar day', () => {
    expect(localDay('2026-08-31T20:00:00Z', 'Asia/Kolkata')).toBe('2026-09-01')
    expect(localDay('2026-08-31T20:00:00Z', 'UTC')).toBe('2026-08-31')
  })
})

describe('buildSalaryReminder', () => {
  it('builds a one-per-user-per-month notification', () => {
    const r = buildSalaryReminder('u1', '2026-08-31T03:00:00Z', 'Asia/Kolkata')
    expect(r.id).toBe('salary-u1-2026-08') // dedup key: user + YYYY-MM
    expect(r.url).toBe('/app?tab=money')
    expect(r.title).toContain('salary')
    expect(r.body.length).toBeGreaterThan(0)
  })

  it('uses the tz-local month for the dedup id at a boundary', () => {
    // 20:00Z Aug 31 is Sep 1 in IST → the id belongs to 2026-09
    expect(buildSalaryReminder('u1', '2026-08-31T20:00:00Z', 'Asia/Kolkata').id).toBe('salary-u1-2026-09')
  })
})
