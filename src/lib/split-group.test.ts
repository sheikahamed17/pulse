import { describe, it, expect } from 'vitest'
import { groupBySplit, type MoneyRowGroup } from './split-group'

type E = { id: string; split_group_id?: string | null; amount: number }

describe('groupBySplit', () => {
  it('returns [] for no entries', () => {
    expect(groupBySplit([])).toEqual([])
  })

  it('leaves entries without a group id as single rows', () => {
    const e: E[] = [
      { id: 'A', split_group_id: null, amount: 100 },
      { id: 'B', split_group_id: undefined, amount: 200 },
    ]
    expect(groupBySplit(e)).toEqual([
      { kind: 'single', entry: e[0] },
      { kind: 'single', entry: e[1] },
    ])
  })

  it('collapses shared-group parts into one split row at the first part, preserving order', () => {
    const e: E[] = [
      { id: 'A', split_group_id: null, amount: 100 },   // 0
      { id: 'ga', split_group_id: 'g1', amount: 1500 }, // 1 → creates split here
      { id: 'B', split_group_id: null, amount: 200 },   // 2
      { id: 'gb', split_group_id: 'g1', amount: 700 },  // 3 → joins split at index 1
      { id: 'C', split_group_id: null, amount: 300 },   // 4
    ]
    const groups = groupBySplit(e)
    expect(groups.length).toBe(4)
    expect(groups[0]).toEqual({ kind: 'single', entry: e[0] })
    const split = groups[1] as Extract<MoneyRowGroup<E>, { kind: 'split' }>
    expect(split.kind).toBe('split')
    expect(split.groupId).toBe('g1')
    expect(split.parts.map(p => p.id)).toEqual(['ga', 'gb'])
    expect(split.total).toBe(2200)
    expect(groups[2]).toEqual({ kind: 'single', entry: e[2] }) // B stays after the split
    expect(groups[3]).toEqual({ kind: 'single', entry: e[4] }) // C
  })
})
