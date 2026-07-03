import { describe, it, expect } from 'vitest'
import { isLocalMonday, priorWeekBounds } from '@/lib/digest-window'

describe('digest-window', () => {
  describe('isLocalMonday', () => {
    it('returns true when local weekday is Monday', () => {
      // 2026-06-22 is a Monday in UTC
      // In Asia/Kolkata, 2026-06-22T09:00:00Z = 2026-06-22 14:30 IST (Monday)
      expect(isLocalMonday('2026-06-22T09:00:00.000Z', 'Asia/Kolkata')).toBe(true)
    })

    it('returns false when local weekday is not Monday', () => {
      // 2026-06-21 is a Sunday in UTC
      // In Asia/Kolkata, 2026-06-21T09:00:00Z = 2026-06-21 14:30 IST (Sunday)
      expect(isLocalMonday('2026-06-21T09:00:00.000Z', 'Asia/Kolkata')).toBe(false)
    })

    it('returns false when local weekday is Tuesday', () => {
      // 2026-06-23 is a Tuesday in UTC
      expect(isLocalMonday('2026-06-23T09:00:00.000Z', 'Asia/Kolkata')).toBe(false)
    })

    it('handles America/New_York DST transition (spring forward 2026-03-08)', () => {
      // Before DST: 2026-03-07 23:00 UTC = 2026-03-07 18:00 EST (Saturday)
      expect(isLocalMonday('2026-03-07T23:00:00.000Z', 'America/New_York')).toBe(false)
      // After DST: 2026-03-09 13:00 UTC = 2026-03-09 08:00 EDT (Monday)
      expect(isLocalMonday('2026-03-09T13:00:00.000Z', 'America/New_York')).toBe(true)
    })

    it('handles America/New_York DST transition (fall back 2026-11-01)', () => {
      // 2026-11-01 05:00 UTC = 2026-11-01 01:00 EDT (Sunday)
      expect(isLocalMonday('2026-11-01T05:00:00.000Z', 'America/New_York')).toBe(false)
      // 2026-11-02 05:00 UTC = 2026-11-02 00:00 EST (Monday)
      expect(isLocalMonday('2026-11-02T05:00:00.000Z', 'America/New_York')).toBe(true)
    })

    it('falls back to UTC on invalid timezone', () => {
      // 2026-06-22T00:00:00Z is a Monday in UTC; if tz is invalid, should use UTC weekday
      expect(isLocalMonday('2026-06-22T00:00:00.000Z', 'Invalid/TZ')).toBe(true)
    })
  })

  describe('priorWeekBounds', () => {
    it('returns prior completed week (Mon-Mon) for Asia/Kolkata Thursday', () => {
      // 2026-07-02T09:00:00Z (Thursday) in Asia/Kolkata = 2026-07-02 14:30 IST (Thursday)
      // Current week starts Mon 2026-06-29 (locally), so prior week starts Mon 2026-06-22 (locally)
      // Local Mon 2026-06-22 00:00 IST = UTC 2026-06-21T18:30:00Z
      // Local Mon 2026-06-29 00:00 IST = UTC 2026-06-28T18:30:00Z
      const bounds = priorWeekBounds('2026-07-02T09:00:00.000Z', 'Asia/Kolkata')
      expect(bounds.startsAt).toBe('2026-06-21T18:30:00.000Z')
      expect(bounds.endsAt).toBe('2026-06-28T18:30:00.000Z')
    })

    it('returns week Mon-Mon for UTC timezone with clean midnight boundaries', () => {
      // 2026-07-02T00:00:00Z (Thursday) in UTC
      // Current UTC week starts Mon 2026-06-29, prior week starts Mon 2026-06-22
      const bounds = priorWeekBounds('2026-07-02T00:00:00.000Z', 'UTC')
      expect(bounds.startsAt).toBe('2026-06-22T00:00:00.000Z')
      expect(bounds.endsAt).toBe('2026-06-29T00:00:00.000Z')
    })

    it('returns same boundaries when called on Monday (week just started)', () => {
      // 2026-06-22T09:00:00Z (Monday) in Asia/Kolkata = 2026-06-22 14:30 IST
      // Since we're on Mon, prior completed week is still 2026-06-15 to 2026-06-22 (local)
      const bounds = priorWeekBounds('2026-06-22T09:00:00.000Z', 'Asia/Kolkata')
      expect(bounds.startsAt).toBe('2026-06-14T18:30:00.000Z')
      expect(bounds.endsAt).toBe('2026-06-21T18:30:00.000Z')
    })

    it('handles America/New_York DST transition week (spring forward)', () => {
      // 2026-03-09T13:00:00Z (Monday after DST) in America/New_York = 2026-03-09 08:00 EDT
      // Prior week: Mon 2026-03-02 (EST, -5) to Mon 2026-03-09 (EDT, -4)
      // Mon 2026-03-02 00:00 EST = UTC 2026-03-02T05:00:00Z
      // Mon 2026-03-09 00:00 EDT = UTC 2026-03-09T04:00:00Z
      const bounds = priorWeekBounds('2026-03-09T13:00:00.000Z', 'America/New_York')
      expect(bounds.startsAt).toBe('2026-03-02T05:00:00.000Z')
      expect(bounds.endsAt).toBe('2026-03-09T04:00:00.000Z')
    })

    it('handles America/New_York fall back transition (skip-DST week)', () => {
      // 2026-11-02T05:00:00Z (Monday after fall-back) in America/New_York = 2026-11-02 00:00 EST
      // Prior week: Mon 2026-10-26 (EDT, -4) to Mon 2026-11-02 (EST, -5)
      // Mon 2026-10-26 00:00 EDT = UTC 2026-10-26T04:00:00Z
      // Mon 2026-11-02 00:00 EST = UTC 2026-11-02T05:00:00Z
      const bounds = priorWeekBounds('2026-11-02T05:00:00.000Z', 'America/New_York')
      expect(bounds.startsAt).toBe('2026-10-26T04:00:00.000Z')
      expect(bounds.endsAt).toBe('2026-11-02T05:00:00.000Z')
    })

    it('falls back to UTC on invalid timezone', () => {
      // Invalid tz → use UTC (same as UTC case above)
      const bounds = priorWeekBounds('2026-07-02T00:00:00.000Z', 'Invalid/TZ')
      expect(bounds.startsAt).toBe('2026-06-22T00:00:00.000Z')
      expect(bounds.endsAt).toBe('2026-06-29T00:00:00.000Z')
    })

    it('verifies timezone conversion for America/New_York and Asia/Kolkata on Tuesday', () => {
      // Concrete example: 2026-07-02T09:00:00.000Z is a Thursday in UTC
      // In America/New_York (UTC-5 EDT): 2026-07-02 04:00 EDT (Thursday)
      // In Asia/Kolkata (UTC+5:30): 2026-07-02 14:30 IST (Thursday)
      // Current week Mon: 2026-06-29 (local in each tz)
      // Prior week Mon: 2026-06-22 (local in each tz)

      // NY: Mon 2026-06-29 00:00 EDT = UTC 2026-06-29T04:00:00Z
      //     Mon 2026-06-22 00:00 EDT = UTC 2026-06-22T04:00:00Z
      const boundsNY = priorWeekBounds('2026-07-02T09:00:00.000Z', 'America/New_York')
      expect(boundsNY.startsAt).toBe('2026-06-22T04:00:00.000Z')
      expect(boundsNY.endsAt).toBe('2026-06-29T04:00:00.000Z')

      // Kolkata: Mon 2026-06-29 00:00 IST = UTC 2026-06-28T18:30:00Z
      //          Mon 2026-06-22 00:00 IST = UTC 2026-06-21T18:30:00Z
      const boundsKol = priorWeekBounds('2026-07-02T09:00:00.000Z', 'Asia/Kolkata')
      expect(boundsKol.startsAt).toBe('2026-06-21T18:30:00.000Z')
      expect(boundsKol.endsAt).toBe('2026-06-28T18:30:00.000Z')

      // UTC (clean boundaries)
      const boundsUTC = priorWeekBounds('2026-07-02T09:00:00.000Z', 'UTC')
      expect(boundsUTC.startsAt).toBe('2026-06-22T00:00:00.000Z')
      expect(boundsUTC.endsAt).toBe('2026-06-29T00:00:00.000Z')
    })
  })
})
