import { describe, it, expect } from 'vitest'
import { InsightPayloadSchema } from '@/lib/op-schemas/insight'

describe('InsightPayloadSchema', () => {
  it('parses a valid insight payload', () => {
    const payload = {
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'Great week!',
      metrics: JSON.stringify({ spend_total: 5000 }),
    }
    const result = InsightPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBe('Great week!')
    }
  })

  it('rejects starts_at >= ends_at', () => {
    const payload = {
      period: 'weekly',
      starts_at: '2026-06-28T18:30:00.000Z',
      ends_at: '2026-06-21T18:30:00.000Z',
      summary: 'Bad',
      metrics: '{}',
    }
    const result = InsightPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects summary > 2000 chars', () => {
    const payload = {
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'a'.repeat(2001),
      metrics: '{}',
    }
    const result = InsightPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects empty metrics', () => {
    const payload = {
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'Test',
      metrics: '',
    }
    const result = InsightPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects non-weekly period', () => {
    const payload = {
      period: 'daily',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'Test',
      metrics: '{}',
    }
    const result = InsightPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })
})
