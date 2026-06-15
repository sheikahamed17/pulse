import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDb } from '@/lib/dexie'
import type { Op } from '@/types/ops'

const sampleOp: Op = {
  id: 'op1',
  hlc: '0000000000000001-000000-d1',
  device_id: 'd1',
  user_id: 'u1',
  entity_kind: 'widget',
  entity_id: 'w1',
  op_type: 'create',
  payload: { label: 'A' },
  schema_version: 1,
}

describe('Dexie store', () => {
  beforeEach(async () => { await resetDb() })

  it('persists an op and reads it back', async () => {
    await db.op_log.add(sampleOp)
    const all = await db.op_log.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('op1')
  })

  it('persists a widget row and reads it by id', async () => {
    await db.widgets.put({
      id: 'w1',
      user_id: 'u1',
      label: 'A',
      field_hlcs: { label: sampleOp.hlc },
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    const w = await db.widgets.get('w1')
    expect(w?.label).toBe('A')
  })
})
