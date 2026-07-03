import { describe, it, expect } from 'vitest'
import { CRON_DISPATCH, resolveCronRoute } from '@/lib/cron-dispatch'

describe('cron-dispatch', () => {
  it('exports CRON_DISPATCH with exactly 5 mappings', () => {
    expect(Object.keys(CRON_DISPATCH)).toHaveLength(5)
  })

  it('maps 0 2 * * * to /api/cron/recur', () => {
    expect(CRON_DISPATCH['0 2 * * *']).toBe('/api/cron/recur')
  })

  it('maps 0 3 * * * to /api/cron/fx', () => {
    expect(CRON_DISPATCH['0 3 * * *']).toBe('/api/cron/fx')
  })

  it('maps */15 * * * * to /api/cron/due-tasks', () => {
    expect(CRON_DISPATCH['*/15 * * * *']).toBe('/api/cron/due-tasks')
  })

  it('maps both Monday digest patterns to /api/cron/digest', () => {
    expect(CRON_DISPATCH['30 2 * * 1']).toBe('/api/cron/digest')
    expect(CRON_DISPATCH['30 14 * * 1']).toBe('/api/cron/digest')
  })

  it('resolveCronRoute returns null for unknown pattern', () => {
    expect(resolveCronRoute('invalid cron')).toBeNull()
  })

  it('resolveCronRoute returns path for known patterns', () => {
    expect(resolveCronRoute('0 2 * * *')).toBe('/api/cron/recur')
    expect(resolveCronRoute('*/15 * * * *')).toBe('/api/cron/due-tasks')
  })
})
