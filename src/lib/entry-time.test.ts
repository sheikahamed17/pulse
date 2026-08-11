import { describe, it, expect } from 'vitest'
import { entryTimeLabel } from './entry-time'

const NOW = Date.parse('2026-08-11T12:00:00Z')
describe('entryTimeLabel', () => {
  it('gives a relative label for recent entries', () => {
    const r = entryTimeLabel('2026-08-11T10:00:00Z', 'UTC', NOW)
    expect(r.relative).toMatch(/hour|hr|2/i)
    expect(r.absolute).toBeTruthy()
  })
  it('gives no relative label past the 7-day threshold', () => {
    const r = entryTimeLabel('2026-07-01T10:00:00Z', 'UTC', NOW)
    expect(r.relative).toBeNull()
  })
})
