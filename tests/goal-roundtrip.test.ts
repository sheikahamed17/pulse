import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('goal entity — round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('goal: create carries all fields to Dexie', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'goal', entity_id: 'g1', op_type: 'create',
      payload: {
        name: 'Emergency Fund',
        target_amount: 500000,
        currency: 'INR',
        icon: '🚨',
        account_id: 'a1',
        saved_amount: 100000,
        target_date: '2026-12-31',
        is_archived: 0,
      },
      user_id: U,
    }))
    const g = await db.goals.get('g1')
    expect(g?.name).toBe('Emergency Fund')
    expect(g?.target_amount).toBe(500000)
    expect(g?.currency).toBe('INR')
    expect(g?.icon).toBe('🚨')
    expect(g?.account_id).toBe('a1')
    expect(g?.saved_amount).toBe(100000)
    expect(g?.target_date).toBe('2026-12-31')
    expect(g?.is_archived).toBe(0)
  })

  it('goal: update only saved_amount leaves target_amount untouched', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'goal', entity_id: 'g1', op_type: 'create',
      payload: {
        name: 'Holiday',
        target_amount: 200000,
        currency: 'INR',
        saved_amount: 0,
        is_archived: 0,
      },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'goal', entity_id: 'g1', op_type: 'update',
      payload: { saved_amount: 50000 },
      user_id: U,
    }))
    const g = await db.goals.get('g1')
    expect(g?.target_amount).toBe(200000)  // untouched
    expect(g?.saved_amount).toBe(50000)    // updated
    expect(g?.name).toBe('Holiday')        // untouched
  })

  it('goal: manual (account_id null) with saved_amount', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'goal', entity_id: 'g2', op_type: 'create',
      payload: {
        name: 'Vacation',
        target_amount: 150000,
        currency: 'INR',
        saved_amount: 30000,
        account_id: null,
      },
      user_id: U,
    }))
    const g = await db.goals.get('g2')
    expect(g?.account_id).toBeNull()
    expect(g?.saved_amount).toBe(30000)
    expect(g?.target_amount).toBe(150000)
  })

  it('goal: optional fields (icon, account_id, target_date) can be absent on create', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'goal', entity_id: 'g3', op_type: 'create',
      payload: {
        name: 'House Down Payment',
        target_amount: 5000000,
        currency: 'INR',
        saved_amount: 0,
        is_archived: 0,
      },
      user_id: U,
    }))
    const g = await db.goals.get('g3')
    expect(g?.name).toBe('House Down Payment')
    expect(g?.target_amount).toBe(5000000)
    expect(g?.icon ?? null).toBeNull()
    expect(g?.account_id ?? null).toBeNull()
    expect(g?.target_date ?? null).toBeNull()
    expect(g?.saved_amount).toBe(0)
    expect(g?.is_archived).toBe(0)
  })
})
