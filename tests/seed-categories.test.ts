import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { seedDefaultCategoriesIfEmpty, DEFAULT_CATEGORIES } from '@/lib/seed-categories'

describe('seedDefaultCategoriesIfEmpty', () => {
  beforeEach(async () => { await resetDb() })

  it('inserts 14 categories when the user has none', async () => {
    const inserted = await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    expect(inserted).toBe(14)
    const all = await db.categories.where('user_id').equals('u1').toArray()
    expect(all).toHaveLength(14)
  })

  it('inserts 9 spend + 5 income categories', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const spend  = await db.categories.where({ user_id: 'u1', kind: 'spend' }).toArray()
    const income = await db.categories.where({ user_id: 'u1', kind: 'income' }).toArray()
    expect(spend).toHaveLength(9)
    expect(income).toHaveLength(5)
  })

  it('emits an Op per category into op_log', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const ops = await db.op_log.where('entity_kind').equals('category').toArray()
    expect(ops).toHaveLength(14)
    expect(ops.every(o => o.op_type === 'create')).toBe(true)
  })

  it('is idempotent — second call inserts nothing', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const second = await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    expect(second).toBe(0)
    expect(await db.categories.where('user_id').equals('u1').count()).toBe(14)
  })

  it('scopes per user — u2 still gets seed even if u1 has categories', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const u2 = await seedDefaultCategoriesIfEmpty({ userId: 'u2' })
    expect(u2).toBe(14)
  })

  it('exports DEFAULT_CATEGORIES with the expected names + icons', () => {
    const names = DEFAULT_CATEGORIES.map(c => c.name)
    expect(names).toContain('Food')
    expect(names).toContain('Rent')
    expect(names).toContain('Salary')
    expect(DEFAULT_CATEGORIES.find(c => c.name === 'Food')?.icon).toBe('🍴')
  })
})
