import { describe, it, expect } from 'vitest'
import { TaskPayloadSchema } from '@/lib/op-schemas/task'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'

describe('TaskPayloadSchema', () => {
  it('accepts a minimal valid task', () => {
    const r = TaskPayloadSchema.safeParse({
      title: 'call mom',
      source: 'voice',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a full task with due_at + priority + completed_at', () => {
    const r = TaskPayloadSchema.safeParse({
      title: 'file taxes',
      due_at: '2026-06-19T15:00:00.000Z',
      priority: 'high',
      completed_at: null,
      source: 'voice',
      raw_input: 'urgent: file taxes by tomorrow at 3pm',
    })
    expect(r.success).toBe(true)
  })

  it('rejects empty title', () => {
    const r = TaskPayloadSchema.safeParse({ title: '', source: 'voice' })
    expect(r.success).toBe(false)
  })

  it('rejects title > 200 chars', () => {
    const r = TaskPayloadSchema.safeParse({
      title: 'x'.repeat(201),
      source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects invalid priority', () => {
    const r = TaskPayloadSchema.safeParse({
      title: 'ok',
      priority: 'critical',
      source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects invalid source', () => {
    const r = TaskPayloadSchema.safeParse({
      title: 'ok',
      source: 'recurring',                   // Phase 1's source enum had this, but tasks don't
    })
    expect(r.success).toBe(false)
  })

  it('rejects bad due_at (not ISO)', () => {
    const r = TaskPayloadSchema.safeParse({
      title: 'ok',
      due_at: 'tomorrow at 3pm',             // not ISO
      source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('defaults priority to medium when omitted', () => {
    const r = TaskPayloadSchema.safeParse({ title: 'ok', source: 'manual' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.priority).toBe('medium')
  })

  it('accepts partial update payload (just completed_at)', () => {
    const r = TaskPayloadSchema.partial().safeParse({
      completed_at: '2026-06-19T15:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})

describe('getPayloadSchemaForKind — task', () => {
  it('returns TaskPayloadSchema for task kind', () => {
    expect(getPayloadSchemaForKind('task')).toBe(TaskPayloadSchema)
  })
})
