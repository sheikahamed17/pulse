import { describe, it, expect } from 'vitest'
import { LearningPayloadSchema } from '@/lib/op-schemas/learning'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'

describe('LearningPayloadSchema', () => {
  it('accepts a valid learning payload', () => {
    const r = LearningPayloadSchema.safeParse({
      text: 'The borrow checker prevents data races', tags: ['Rust', 'concurrency'],
      attribution: 'Rust book', occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice',
    })
    expect(r.success).toBe(true)
  })
  it('defaults tags to [] and allows null attribution', () => {
    const r = LearningPayloadSchema.parse({ text: 'x', occurred_at: '2026-07-08T10:00:00.000Z', source: 'manual' })
    expect(r.tags).toEqual([]); expect(r.attribution ?? null).toBeNull()
  })
  it('rejects empty text and caps tags at 12', () => {
    expect(LearningPayloadSchema.safeParse({ text: '', occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice' }).success).toBe(false)
    expect(LearningPayloadSchema.safeParse({ text: 'x', tags: Array(13).fill('t'), occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice' }).success).toBe(false)
  })
  it('is registered in getPayloadSchemaForKind', () => {
    expect(getPayloadSchemaForKind('learning')).toBe(LearningPayloadSchema)
  })
})
