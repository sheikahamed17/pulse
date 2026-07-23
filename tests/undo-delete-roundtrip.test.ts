import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import { resurrectPayload, type Resurrectable } from '@/lib/undo-delete'

const U = 'u1'
async function del(kind: Resurrectable, id: string) {
  await applyLocalOp(await generateOp({ entity_kind: kind, entity_id: id, op_type: 'delete', payload: {}, user_id: U }))
}
async function resurrect(kind: Resurrectable, row: { id: string; description?: string | null; title?: string; text?: string; body?: string }) {
  await applyLocalOp(await generateOp({ entity_kind: kind, entity_id: row.id, op_type: 'update', payload: resurrectPayload(kind, row), user_id: U }))
}

describe('undo delete — resurrection round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('money: delete then undo restores the row', async () => {
    await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: 'm1', op_type: 'create', payload: { amount: 5000, currency: 'INR', direction: 'out', description: 'chai', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual' }, user_id: U }))
    await del('money', 'm1')
    expect((await db.money_entries.get('m1'))?.deleted_at).not.toBeNull()
    await resurrect('money', { id: 'm1', description: 'chai' })
    const m = await db.money_entries.get('m1')
    expect(m?.deleted_at ?? null).toBeNull()
    expect(m?.amount).toBe(5000)
  })

  it('task: full-fidelity undo restores parent + all sub-tasks', async () => {
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: 'p', op_type: 'create', payload: { title: 'Parent', priority: 'medium', completed_at: null, source: 'manual', tags: [], project_id: null }, user_id: U }))
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: 'c1', op_type: 'create', payload: { title: 'C1', priority: 'medium', completed_at: null, source: 'manual', parent_id: 'p', tags: [], project_id: null }, user_id: U }))
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: 'c2', op_type: 'create', payload: { title: 'C2', priority: 'medium', completed_at: null, source: 'manual', parent_id: 'p', tags: [], project_id: null }, user_id: U }))
    // delete parent → cascade: children then parent tombstoned
    await del('task', 'c1'); await del('task', 'c2'); await del('task', 'p')
    expect((await db.tasks.get('p'))?.deleted_at).not.toBeNull()
    // undo: resurrect the whole tombstoned set
    for (const r of [{ id: 'c1', title: 'C1' }, { id: 'c2', title: 'C2' }, { id: 'p', title: 'Parent' }]) await resurrect('task', r)
    expect((await db.tasks.get('p'))?.deleted_at ?? null).toBeNull()
    expect((await db.tasks.get('c1'))?.deleted_at ?? null).toBeNull()
    expect((await db.tasks.get('c2'))?.deleted_at ?? null).toBeNull()
    expect((await db.tasks.get('p'))?.title).toBe('Parent')
  })
})
