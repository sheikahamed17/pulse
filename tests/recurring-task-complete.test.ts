import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import { taskCompletionOps } from '@/lib/recurring-task'

const U = 'u1'

async function create(id: string, payload: Record<string, unknown>) {
  await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: id, op_type: 'create', payload, user_id: U }))
}

// Mirrors task-list.toggleComplete: apply the completion update, then create next if any.
async function complete(id: string, nowIso: string) {
  const t = await db.tasks.get(id)
  if (!t) throw new Error('missing')
  const { update, next } = taskCompletionOps(t, nowIso)
  await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: id, op_type: 'update', payload: update, user_id: U }))
  if (next) await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: `n-${id}-${nowIso}`, op_type: 'create', payload: next, user_id: U }))
}

const openTasks = async () => (await db.tasks.where('user_id').equals(U).toArray()).filter(t => !t.deleted_at && !t.completed_at)

describe('recurring task completion (round-trip)', () => {
  beforeEach(async () => { await resetDb() })

  it('completing spawns exactly one next instance; finished one keeps no recurrence', async () => {
    await create('t1', { title: 'Water plants', priority: 'medium', due_at: '2026-07-22T09:00:00.000Z', source: 'manual', recur_period: 'daily', recur_interval: 3 })
    await complete('t1', '2026-07-22T09:00:00.000Z')

    const done = await db.tasks.get('t1')
    expect(done?.completed_at).toBe('2026-07-22T09:00:00.000Z')
    expect(done?.recur_period).toBeNull()

    const open = await openTasks()
    expect(open).toHaveLength(1)
    expect(open[0].due_at).toBe('2026-07-25T09:00:00.000Z')
    expect(open[0].recur_period).toBe('daily')
    expect(open[0].source).toBe('recurring')
  })

  it('re-toggling the finished task does NOT double-spawn (recur was cleared)', async () => {
    await create('t1', { title: 'x', priority: 'low', source: 'manual', recur_period: 'daily', recur_interval: 1 })
    await complete('t1', '2026-07-22T09:00:00.000Z') // → 1 spawned
    await complete('t1', '2026-07-23T09:00:00.000Z') // un-complete (no spawn)
    await complete('t1', '2026-07-24T09:00:00.000Z') // re-complete; recur null → no spawn

    const all = (await db.tasks.where('user_id').equals(U).toArray()).filter(t => !t.deleted_at)
    const spawned = all.filter(t => t.source === 'recurring')
    expect(spawned).toHaveLength(1)
  })

  it('completing a non-recurring task spawns nothing', async () => {
    await create('t1', { title: 'one-off', priority: 'medium', source: 'manual' })
    await complete('t1', '2026-07-22T09:00:00.000Z')
    expect(await openTasks()).toHaveLength(0)
  })
})
