import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import { rollupOps } from '@/lib/subtasks'

const U = 'u1'
const create = async (id: string, payload: Record<string, unknown>) =>
  // completed_at: null default mirrors confirmEntry (real task creates always set it)
  applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: id, op_type: 'create', payload: { completed_at: null, ...payload }, user_id: U }))
const update = async (id: string, payload: Record<string, unknown>) =>
  applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: id, op_type: 'update', payload, user_id: U }))

// Mirror the component: toggle a child, then roll up to the parent.
async function completeChild(childId: string, parentId: string, nowIso: string) {
  await update(childId, { completed_at: nowIso })
  const all = await db.tasks.where('user_id').equals(U).toArray()
  const parent = all.find(t => t.id === parentId)!
  const siblings = all.filter(t => t.parent_id === parentId && !t.deleted_at)
  const roll = rollupOps(parent, siblings, nowIso)
  if (roll) await update(parentId, roll)
}

describe('sub-task completion rollup (round-trip)', () => {
  beforeEach(async () => { await resetDb() })

  it('completing all children auto-completes the parent', async () => {
    await create('p', { title: 'Plan', priority: 'medium', source: 'manual' })
    await create('c1', { title: 'a', priority: 'medium', source: 'manual', parent_id: 'p' })
    await create('c2', { title: 'b', priority: 'medium', source: 'manual', parent_id: 'p' })
    await completeChild('c1', 'p', '2026-07-22T09:00:00.000Z')
    expect((await db.tasks.get('p'))?.completed_at).toBeNull() // 1/2 → parent still open
    await completeChild('c2', 'p', '2026-07-22T09:05:00.000Z')
    expect((await db.tasks.get('p'))?.completed_at).toBe('2026-07-22T09:05:00.000Z') // 2/2 → parent complete
  })

  it('re-opening a child re-opens an auto-completed parent', async () => {
    await create('p', { title: 'Plan', priority: 'medium', source: 'manual' })
    await create('c1', { title: 'a', priority: 'medium', source: 'manual', parent_id: 'p' })
    await completeChild('c1', 'p', '2026-07-22T09:00:00.000Z') // 1/1 → parent complete
    expect((await db.tasks.get('p'))?.completed_at).toBeTruthy()
    await update('c1', { completed_at: null })
    const all = await db.tasks.where('user_id').equals(U).toArray()
    const roll = rollupOps(all.find(t => t.id === 'p')!, all.filter(t => t.parent_id === 'p' && !t.deleted_at), '2026-07-22T10:00:00.000Z')
    if (roll) await update('p', roll)
    expect((await db.tasks.get('p'))?.completed_at).toBeNull()
  })
})
