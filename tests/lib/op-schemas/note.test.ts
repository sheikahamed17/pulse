import { describe, it, expect } from 'vitest'
import { NotePayloadSchema } from '@/lib/op-schemas/note'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'

describe('NotePayloadSchema', () => {
  it('accepts a valid note payload', () => {
    const r = NotePayloadSchema.safeParse({
      title: 'Quick note', body: 'WiFi password is hunter2', tags: ['home'],
      occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice',
    })
    expect(r.success).toBe(true)
  })
  it('defaults tags to [] and allows null title', () => {
    const r = NotePayloadSchema.parse({ body: 'x', occurred_at: '2026-07-08T10:00:00.000Z', source: 'manual' })
    expect(r.tags).toEqual([])
    expect(r.title ?? null).toBeNull()
  })
  it('rejects empty body and caps tags at 12', () => {
    expect(NotePayloadSchema.safeParse({ title: 'x', body: '', occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice' }).success).toBe(false)
    expect(NotePayloadSchema.safeParse({ body: 'x', tags: Array(13).fill('t'), occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice' }).success).toBe(false)
  })
  it('is registered in getPayloadSchemaForKind', () => {
    expect(getPayloadSchemaForKind('note')).toBe(NotePayloadSchema)
  })
})
