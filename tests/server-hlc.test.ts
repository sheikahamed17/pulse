import { describe, it, expect } from 'vitest'
import { serverHlcFor } from '@/lib/server-hlc'

describe('serverHlcFor', () => {
  it('formats as DDDD..-000000-cron', () => {
    const iso = '2026-06-28T12:00:00.000Z'
    const result = serverHlcFor(iso)
    const parts = result.split('-')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toHaveLength(16)  // padded ms
    expect(parts[1]).toBe('000000')
    expect(parts[2]).toBe('cron')
  })

  it('is monotonic per ms input', () => {
    const iso1 = '2026-06-28T12:00:00.000Z'
    const iso2 = '2026-06-28T12:00:01.000Z'
    const hlc1 = serverHlcFor(iso1)
    const hlc2 = serverHlcFor(iso2)
    expect(hlc1 < hlc2).toBe(true)
  })

  it('is deterministic', () => {
    const iso = '2026-06-28T12:00:00.000Z'
    const hlc1 = serverHlcFor(iso)
    const hlc2 = serverHlcFor(iso)
    expect(hlc1).toBe(hlc2)
  })
})
