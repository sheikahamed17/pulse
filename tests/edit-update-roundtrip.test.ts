import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('edit via update op — round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('money: update changes edited fields, preserves untouched', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'money', entity_id: 'm1', op_type: 'create',
      payload: { amount: 8000, currency: 'INR', direction: 'out', category_id: 'c1', description: 'chai', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual' },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'money', entity_id: 'm1', op_type: 'update',
      payload: { amount: 7500, currency: 'INR', direction: 'out', category_id: 'c2', description: 'July rent' },
      user_id: U,
    }))
    const m = await db.money_entries.get('m1')
    expect(m?.amount).toBe(7500)
    expect(m?.category_id).toBe('c2')
    expect(m?.description).toBe('July rent')
    expect(m?.occurred_at).toBe('2026-07-01T10:00:00.000Z') // untouched
    expect(m?.source).toBe('manual')                         // untouched
  })

  it('task: update changes title/priority/tags/project, preserves completed_at + source', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'create',
      payload: { title: 'old', priority: 'low', completed_at: null, source: 'manual', tags: ['a'], project_id: null },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'update',
      payload: { title: 'new', due_at: null, priority: 'high', tags: ['a', 'b'], project_id: 'p1' },
      user_id: U,
    }))
    const t = await db.tasks.get('t1')
    expect(t?.title).toBe('new')
    expect(t?.priority).toBe('high')
    expect(t?.tags).toEqual(['a', 'b'])
    expect(t?.project_id).toBe('p1')
    expect(t?.completed_at ?? null).toBeNull()   // untouched
    expect(t?.source).toBe('manual')             // untouched
  })
})
