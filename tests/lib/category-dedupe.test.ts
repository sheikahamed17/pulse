import { describe, it, expect } from 'vitest'
import { categoryId, slugify, planCategoryDedupe, type DedupeCat } from '@/lib/category-dedupe'

describe('slugify / categoryId', () => {
  it('slugifies names to lowercase dash-separated', () => {
    expect(slugify('Rent')).toBe('rent')
    expect(slugify('Food & Drink')).toBe('food-drink')
    expect(slugify('  Bills  ')).toBe('bills')
  })
  it('categoryId is deterministic per user+name', () => {
    expect(categoryId('u1', 'Rent')).toBe('cat-u1-rent')
    expect(categoryId('u1', 'Rent')).toBe(categoryId('u1', 'Rent'))
    expect(categoryId('u2', 'Rent')).toBe('cat-u2-rent')
  })
})

const cat = (id: string, name: string, kind: 'spend' | 'income' = 'spend', sort_order = 0): DedupeCat =>
  ({ id, name, kind, icon: '🏠', sort_order })

describe('planCategoryDedupe', () => {
  const u = 'u1'

  it('collapses duplicate names to one canonical id + remaps + tombstones the rest', () => {
    const cats = [cat('r1', 'Rent', 'spend', 2), cat('r2', 'Rent', 'spend', 2), cat('f1', 'Food', 'spend', 0)]
    const plan = planCategoryDedupe(cats, u)
    expect(plan.remap['r1']).toBe('cat-u1-rent')
    expect(plan.remap['r2']).toBe('cat-u1-rent')
    expect(plan.remap['f1']).toBe('cat-u1-food')
    expect(plan.tombstones.sort()).toEqual(['f1', 'r1', 'r2'])
    expect(plan.canonical.map(c => c.id).sort()).toEqual(['cat-u1-food', 'cat-u1-rent'])
    const rent = plan.canonical.find(c => c.id === 'cat-u1-rent')!
    expect(rent.name).toBe('Rent')
    expect(rent.kind).toBe('spend')
  })

  it('is idempotent — an already-canonical category is left alone', () => {
    const cats = [cat('cat-u1-rent', 'Rent', 'spend', 2)]
    const plan = planCategoryDedupe(cats, u)
    expect(plan.remap).toEqual({})
    expect(plan.tombstones).toEqual([])
    expect(plan.canonical).toEqual([])
  })

  it('when the canonical already exists alongside dupes, remaps dupes to it without re-creating it', () => {
    const cats = [cat('cat-u1-rent', 'Rent', 'spend', 2), cat('r2', 'Rent', 'spend', 2)]
    const plan = planCategoryDedupe(cats, u)
    expect(plan.remap).toEqual({ r2: 'cat-u1-rent' })
    expect(plan.tombstones).toEqual(['r2'])
    expect(plan.canonical).toEqual([]) // canonical already present — don't recreate
  })

  it('empty input → empty plan', () => {
    expect(planCategoryDedupe([], u)).toEqual({ canonical: [], remap: {}, tombstones: [] })
  })
})
