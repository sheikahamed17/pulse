import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('task nudge_muted_at round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('mutes then un-mutes via update ops', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'create',
      payload: { title: 'Pay rent', priority: 'high', completed_at: null, source: 'manual', tags: [], project_id: null },
      user_id: U,
    }))
    expect((await db.tasks.get('t1'))?.nudge_muted_at ?? null).toBeNull()

    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'update',
      payload: { nudge_muted_at: '2026-07-23T10:00:00.000Z' },
      user_id: U,
    }))
    expect((await db.tasks.get('t1'))?.nudge_muted_at).toBe('2026-07-23T10:00:00.000Z')

    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'update',
      payload: { nudge_muted_at: null },
      user_id: U,
    }))
    expect((await db.tasks.get('t1'))?.nudge_muted_at ?? null).toBeNull()
  })
})
