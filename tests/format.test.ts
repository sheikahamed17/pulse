import { describe, it, expect } from 'vitest'
import { formatLocalDate, formatLocalDateTime, formatLocalDateOnly } from '@/lib/format'

describe('formatLocalDate', () => {
  it('formats an ISO timestamp in a given timezone', () => {
    // 2026-06-18T14:30:00.000Z = 20:00 IST (UTC+5:30)
    const out = formatLocalDate('2026-06-18T14:30:00.000Z', 'Asia/Kolkata', {
      dateStyle: 'medium', timeStyle: 'short', hour12: false,
    })
    // Output depends on Intl, but it should contain "Jun" or "18" and "20:00"
    expect(out).toMatch(/Jun/i)
    expect(out).toContain('20:00')
  })

  it('formats in America/New_York correctly', () => {
    // 2026-06-18T14:30:00.000Z = 10:30 EDT (UTC-4 in June)
    const out = formatLocalDate('2026-06-18T14:30:00.000Z', 'America/New_York', {
      dateStyle: 'medium', timeStyle: 'short', hour12: false,
    })
    expect(out).toContain('10:30')
  })

  it('falls back to UTC for an unknown tz', () => {
    // Intl throws RangeError on invalid TZ — formatLocalDate should catch and fallback to UTC
    const out = formatLocalDate('2026-06-18T14:30:00.000Z', 'Invalid/Zone', {
      dateStyle: 'medium', timeStyle: 'short', hour12: false,
    })
    expect(out).toContain('14:30')
  })
})

describe('formatLocalDateTime', () => {
  it('formats with medium date + short time', () => {
    const out = formatLocalDateTime('2026-06-18T14:30:00.000Z', 'Asia/Kolkata')
    expect(out).toMatch(/Jun/i)
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('formatLocalDateOnly', () => {
  it('formats date-only without time', () => {
    const out = formatLocalDateOnly('2026-06-18T14:30:00.000Z', 'Asia/Kolkata')
    expect(out).toMatch(/Jun/i)
    expect(out).not.toMatch(/\d{1,2}:\d{2}/)
  })
})
