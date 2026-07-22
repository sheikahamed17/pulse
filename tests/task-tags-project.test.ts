import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('task tags + project_id round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes tags (native array) + project_id on the task', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'create',
      payload: { title: 'Call bank', priority: 'medium', source: 'manual', tags: ['finance', 'urgent'], project_id: 'p1' },
      user_id: U,
    }))
    const t = await db.tasks.get('t1')
    expect(t?.tags).toEqual(['finance', 'urgent'])
    expect(t?.project_id).toBe('p1')
  })

  it('defaults tags to [] and project_id to null when omitted', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't2', op_type: 'create',
      payload: { title: 'x', priority: 'low', source: 'manual' },
      user_id: U,
    }))
    const t = await db.tasks.get('t2')
    expect(t?.tags ?? []).toEqual([])
    expect(t?.project_id ?? null).toBeNull()
  })
})
