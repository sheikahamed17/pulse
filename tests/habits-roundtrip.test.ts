import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('habit + habit_log round-trip (client-side)', () => {
  beforeEach(async () => { await resetDb() })

  it('habit: create persists to client Dexie', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'create',
      payload: { name: 'Meditate', icon: '🧘', is_archived: 0 },
      user_id: U,
    }))
    const h = await db.habits.get('h1')
    expect(h?.id).toBe('h1')
    expect(h?.user_id).toBe(U)
    expect(h?.name).toBe('Meditate')
    expect(h?.icon).toBe('🧘')
    expect(h?.is_archived).toBe(0)
    expect(h?.field_hlcs).toBeDefined()
    expect(h?.created_at).toBeDefined()
    expect(h?.updated_at).toBeDefined()
    expect(h?.deleted_at).toBeNull()
  })

  it('habit_log: create persists to client Dexie', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit_log', entity_id: 'hlog-h1-2026-08-22', op_type: 'create',
      payload: { habit_id: 'h1', day: '2026-08-22' },
      user_id: U,
    }))
    const hl = await db.habit_logs.get('hlog-h1-2026-08-22')
    expect(hl?.id).toBe('hlog-h1-2026-08-22')
    expect(hl?.user_id).toBe(U)
    expect(hl?.habit_id).toBe('h1')
    expect(hl?.day).toBe('2026-08-22')
    expect(hl?.field_hlcs).toBeDefined()
    expect(hl?.created_at).toBeDefined()
    expect(hl?.updated_at).toBeDefined()
    expect(hl?.deleted_at).toBeNull()
  })

  it('habit: update name via per-field LWW', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'create',
      payload: { name: 'Meditate', icon: '🧘' },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'update',
      payload: { name: 'Run' },
      user_id: U,
    }))
    const h = await db.habits.get('h1')
    expect(h?.name).toBe('Run')
    expect(h?.icon).toBe('🧘') // untouched by update
  })

  it('habit_log: DELETE op tombstones on client', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit_log', entity_id: 'hlog-h1-2026-08-22', op_type: 'create',
      payload: { habit_id: 'h1', day: '2026-08-22' },
      user_id: U,
    }))
    const hlBefore = await db.habit_logs.get('hlog-h1-2026-08-22')
    expect(hlBefore?.deleted_at).toBeNull()

    await applyLocalOp(await generateOp({
      entity_kind: 'habit_log', entity_id: 'hlog-h1-2026-08-22', op_type: 'delete',
      payload: {},
      user_id: U,
    }))
    const hlAfter = await db.habit_logs.get('hlog-h1-2026-08-22')
    expect(hlAfter?.deleted_at).toBeDefined()
    expect(hlAfter?.deleted_at).not.toBeNull()
  })

  it('habit: optional icon omitted stays undefined', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'create',
      payload: { name: 'Run' },
      user_id: U,
    }))
    const h = await db.habits.get('h1')
    expect(h?.icon).toBeUndefined()
  })

  it('habit: optional is_archived omitted stays undefined', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'create',
      payload: { name: 'Run' },
      user_id: U,
    }))
    const h = await db.habits.get('h1')
    expect(h?.is_archived).toBeUndefined()
  })

  it('habit: create with schedule persists to client Dexie', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'create',
      payload: { name: 'Gym', icon: '💪', schedule: '1,3,5' },
      user_id: U,
    }))
    const h = await db.habits.get('h1')
    expect(h?.id).toBe('h1')
    expect(h?.name).toBe('Gym')
    expect(h?.schedule).toBe('1,3,5')
  })

  it('habit: update only schedule via per-field LWW leaves name unchanged', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'create',
      payload: { name: 'Gym', icon: '💪', schedule: '1,3,5' },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'habit', entity_id: 'h1', op_type: 'update',
      payload: { schedule: '0,2,4,6' },
      user_id: U,
    }))
    const h = await db.habits.get('h1')
    expect(h?.name).toBe('Gym') // unchanged
    expect(h?.icon).toBe('💪') // unchanged
    expect(h?.schedule).toBe('0,2,4,6') // updated
  })
})
