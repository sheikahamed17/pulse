import { describe, it, expect } from 'vitest'
import { CRON_DISPATCH, resolveCronRoute, resolveSecondaryCronRoutes } from '@/lib/cron-dispatch'

describe('cron-dispatch', () => {
  it('stays within the Cloudflare limit of 5 cron triggers (API code 10072)', () => {
    expect(Object.keys(CRON_DISPATCH).length).toBeLessThanOrEqual(5)
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

  it('runs budget alerts as a secondary route on the daily FX tick (no extra trigger)', () => {
    expect(resolveSecondaryCronRoutes('0 3 * * *')).toContain('/api/cron/budgets')
    expect(CRON_DISPATCH['0 8 * * *']).toBeUndefined()
  })

  it('resolveCronRoute returns null for unknown pattern', () => {
    expect(resolveCronRoute('invalid cron')).toBeNull()
  })

  it('resolveCronRoute returns path for known patterns', () => {
    expect(resolveCronRoute('0 2 * * *')).toBe('/api/cron/recur')
    expect(resolveCronRoute('*/15 * * * *')).toBe('/api/cron/due-tasks')
  })
})
