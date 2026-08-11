import { describe, it, expect } from 'vitest'
import { makeCategoryResolver } from './category-resolve'

const cats = [
  { id: 'active-rent', name: 'Rent', icon: '🏠', kind: 'spend' as const },
  { id: 'old-rent',    name: 'Rent', icon: null, kind: 'spend' as const },   // e.g. tombstoned dupe
]

describe('makeCategoryResolver', () => {
  it('resolves an id regardless of active/archived state', () => {
    const r = makeCategoryResolver(cats)
    expect(r('active-rent')?.name).toBe('Rent')
    expect(r('old-rent')?.name).toBe('Rent')   // key fix: leftover id still resolves
  })
  it('returns null for null or unknown id', () => {
    const r = makeCategoryResolver(cats)
    expect(r(null)).toBeNull()
    expect(r('ghost')).toBeNull()
  })
})
