import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'
const op = (entity_id: string, op_type: 'create' | 'update' | 'delete', payload: Record<string, unknown>) =>
  generateOp({ entity_kind: 'project', entity_id, op_type, payload, user_id: U }).then(applyLocalOp)

describe('project entity (client round-trip)', () => {
  beforeEach(async () => { await resetDb() })

  it('create → applyLocalOp materializes to db.projects (the client link)', async () => {
    await op('p1', 'create', { name: 'Money', color: '#6f7bff', archived: 0 })
    const row = await db.projects.get('p1')
    expect(row?.name).toBe('Money')
    expect(row?.color).toBe('#6f7bff')
    expect(row?.archived).toBe(0)
  })

  it('update LWW-merges (rename + archive)', async () => {
    await op('p1', 'create', { name: 'Money', color: null, archived: 0 })
    await op('p1', 'update', { name: 'Finance', archived: 1 })
    const row = await db.projects.get('p1')
    expect(row?.name).toBe('Finance')
    expect(row?.archived).toBe(1)
  })

  it('delete tombstones', async () => {
    await op('p1', 'create', { name: 'Money', color: null, archived: 0 })
    await op('p1', 'delete', {})
    expect((await db.projects.get('p1'))?.deleted_at).toBeTruthy()
  })
})
