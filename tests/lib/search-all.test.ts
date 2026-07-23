import { describe, it, expect } from 'vitest'
import { searchAll } from '@/lib/search-all'
import type { CategoryRow } from '@/lib/dexie'

/* eslint-disable @typescript-eslint/no-explicit-any */
const cats = new Map<string, CategoryRow>([['c1', { id: 'c1', name: 'Rent', icon: '🏠' } as unknown as CategoryRow]])
const money = [{ id: 'm1', description: 'July payment', category_id: 'c1', amount: 750000, currency: 'INR' }] as any
const tasks = [{ id: 't1', title: 'Pay rent', tags: ['home'] }, { id: 't2', title: 'Buy milk', tags: [] }] as any
const learnings = [{ id: 'l1', text: 'Learned about rent control', tags: [], attribution: 'blog' }] as any
const notes = [{ id: 'n1', title: 'Landlord', body: 'deposit is 2x rent', tags: [] }, { id: 'n2', title: null, body: 'random note', tags: ['misc'] }] as any

function run(q: string) { return searchAll(q, { money, tasks, learnings, notes, categoryById: cats }) }

describe('searchAll', () => {
  it('empty query → no groups', () => { expect(run('  ')).toEqual([]) })

  it('matches money by category name + formats the amount snippet', () => {
    const g = run('rent').find(x => x.kind === 'money')
    expect(g?.items.map(i => i.id)).toContain('m1')
    expect(g?.items[0].snippet).toContain('7,500') // 750000/100
  })

  it('matches task by title and by tag; case-insensitive', () => {
    expect(run('RENT').find(x => x.kind === 'tasks')?.items.map(i => i.id)).toEqual(['t1'])
    expect(run('home').find(x => x.kind === 'tasks')?.items.map(i => i.id)).toEqual(['t1'])
  })

  it('matches learning by text and attribution', () => {
    expect(run('rent control').find(x => x.kind === 'learning')?.items.map(i => i.id)).toEqual(['l1'])
    expect(run('blog').find(x => x.kind === 'learning')?.items.map(i => i.id)).toEqual(['l1'])
  })

  it('matches note by title and body; label falls back to body when no title', () => {
    expect(run('landlord').find(x => x.kind === 'notes')?.items.map(i => i.id)).toEqual(['n1'])
    expect(run('random').find(x => x.kind === 'notes')?.items[0].label).toBe('random note')
  })

  it('returns matching groups in tab order', () => {
    // 'rent' matches money (category), task t1, learning l1, note n1 (body)
    expect(run('rent').map(g => g.kind)).toEqual(['money', 'tasks', 'learning', 'notes'])
  })

  it('caps at 25 items per group and flags truncated', () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `x${i}`, title: 'rent task', tags: [] })) as any
    const g = searchAll('rent', { money: [], tasks: many, learnings: [], notes: [], categoryById: cats }).find(x => x.kind === 'tasks')
    expect(g?.items).toHaveLength(25)
    expect(g?.truncated).toBe(true)
  })
})
