import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import { runCategoryDedupeOnce } from '@/lib/dedupe-categories-migration'

const U = 'u1'

async function op(entity_kind: 'category' | 'money' | 'budget', entity_id: string, payload: Record<string, unknown>) {
  await applyLocalOp(await generateOp({ entity_kind, entity_id, op_type: 'create', payload, user_id: U }))
}

/** Reproduce the polluted state: two "Rent" dupes + a "Food", a money entry on
 *  one Rent dupe, and a budget on the OTHER Rent dupe (Sheik's exact situation). */
async function seedPollutedState() {
  await op('category', 'r1', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 })
  await op('category', 'r2', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 })
  await op('category', 'f1', { name: 'Food', kind: 'spend', icon: '🍴', sort_order: 0 })
  await op('money', 'm1', { amount: 750000, currency: 'INR', direction: 'out', category_id: 'r2', occurred_at: new Date().toISOString(), source: 'manual' })
  await op('budget', 'r1', { category_id: 'r1', amount: 800000, currency: 'INR' })
}

describe('runCategoryDedupeOnce', () => {
  beforeEach(async () => { await resetDb() })

  it('converges dupes: money + budget end up on the SAME canonical Rent (budget will now match spend)', async () => {
    await seedPollutedState()
    const res = await runCategoryDedupeOnce({ userId: U })

    expect(res.ran).toBe(true)
    expect(res.tombstoned).toBe(3) // r1, r2, f1

    // Live categories collapsed to one canonical per name
    const live = (await db.categories.where('user_id').equals(U).toArray()).filter(c => !c.deleted_at)
    expect(live.map(c => c.id).sort()).toEqual(['cat-u1-food', 'cat-u1-rent'])

    // Money remapped to canonical Rent
    const m = await db.money_entries.get('m1')
    expect(m?.category_id).toBe('cat-u1-rent')

    // Old budget tombstoned; new budget on canonical Rent, same amount
    expect((await db.budgets.get('r1'))?.deleted_at).toBeTruthy()
    const b = await db.budgets.get('cat-u1-rent')
    expect(b?.deleted_at ?? null).toBeNull()
    expect(b?.amount).toBe(800000)

    // THE FIX: budget.category_id === money.category_id → computeBudgetProgress will match (was the ₹0 bug)
    expect(b?.category_id).toBe(m?.category_id)
  })

  it('collapses two budgets on two Rent dupes onto ONE canonical budget — highest cap wins, no silent loss', async () => {
    await op('category', 'r1', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 })
    await op('category', 'r2', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 })
    await op('budget', 'r1', { category_id: 'r1', amount: 800000, currency: 'INR' }) // 8000
    await op('budget', 'r2', { category_id: 'r2', amount: 500000, currency: 'INR' }) // 5000 (lower)

    await runCategoryDedupeOnce({ userId: U })

    // both dupe budgets tombstoned
    expect((await db.budgets.get('r1'))?.deleted_at).toBeTruthy()
    expect((await db.budgets.get('r2'))?.deleted_at).toBeTruthy()
    // exactly one live budget, on the canonical id, at the HIGHER cap (8000) — not arbitrary LWW
    const live = (await db.budgets.where('user_id').equals(U).toArray()).filter(b => !b.deleted_at)
    expect(live).toHaveLength(1)
    expect(live[0].id).toBe('cat-u1-rent')
    expect(live[0].amount).toBe(800000)
  })

  it('does not let a stale dupe budget clobber a budget already set on the canonical id', async () => {
    await op('category', 'cat-u1-rent', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 })
    await op('category', 'r1', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 }) // dupe
    await op('budget', 'cat-u1-rent', { category_id: 'cat-u1-rent', amount: 900000, currency: 'INR' }) // user's real 9000 cap
    await op('budget', 'r1', { category_id: 'r1', amount: 300000, currency: 'INR' }) // stale 3000 on dupe

    await runCategoryDedupeOnce({ userId: U })

    expect((await db.budgets.get('r1'))?.deleted_at).toBeTruthy()
    const b = await db.budgets.get('cat-u1-rent')
    expect(b?.deleted_at ?? null).toBeNull()
    expect(b?.amount).toBe(900000) // canonical cap preserved, not stomped by the 3000 dupe
  })

  it('is idempotent — a second run does nothing (flag set)', async () => {
    await seedPollutedState()
    await runCategoryDedupeOnce({ userId: U })
    const second = await runCategoryDedupeOnce({ userId: U })
    expect(second.ran).toBe(false)
  })

  it('no-op on a clean (already-canonical) account', async () => {
    await op('category', 'cat-u1-rent', { name: 'Rent', kind: 'spend', icon: '🏠', sort_order: 2 })
    const res = await runCategoryDedupeOnce({ userId: U })
    expect(res.tombstoned).toBe(0)
    // the canonical category is untouched + live
    expect((await db.categories.get('cat-u1-rent'))?.deleted_at ?? null).toBeNull()
  })
})
