import { describe, it, expect } from 'vitest'
import { widgetId, reorder } from '@/lib/widgets'

describe('widgetId', () => {
  it('generates deterministic ids from userId and type', () => {
    const id1 = widgetId('user-123', 'spent')
    const id2 = widgetId('user-123', 'spent')
    expect(id1).toBe(id2)
    expect(id1).toBe('widget-user-123-spent')
  })

  it('generates different ids for different types', () => {
    const id1 = widgetId('user-123', 'spent')
    const id2 = widgetId('user-123', 'budgets')
    expect(id1).not.toBe(id2)
  })

  it('generates different ids for different users', () => {
    const id1 = widgetId('user-1', 'spent')
    const id2 = widgetId('user-2', 'spent')
    expect(id1).not.toBe(id2)
  })
})

describe('reorder', () => {
  it('swaps neighbors when moving up from the middle', () => {
    const items = [
      { id: 'w1', sort_order: 0 },
      { id: 'w2', sort_order: 1 },
      { id: 'w3', sort_order: 2 },
    ]
    const result = reorder(items, 'w2', 'up')
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: 'w1', sort_order: 1 })
    expect(result).toContainEqual({ id: 'w2', sort_order: 0 })
  })

  it('swaps neighbors when moving down from the middle', () => {
    const items = [
      { id: 'w1', sort_order: 0 },
      { id: 'w2', sort_order: 1 },
      { id: 'w3', sort_order: 2 },
    ]
    const result = reorder(items, 'w2', 'down')
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: 'w2', sort_order: 2 })
    expect(result).toContainEqual({ id: 'w3', sort_order: 1 })
  })

  it('returns empty when moving up at the top boundary', () => {
    const items = [
      { id: 'w1', sort_order: 0 },
      { id: 'w2', sort_order: 1 },
    ]
    const result = reorder(items, 'w1', 'up')
    expect(result).toEqual([])
  })

  it('returns empty when moving down at the bottom boundary', () => {
    const items = [
      { id: 'w1', sort_order: 0 },
      { id: 'w2', sort_order: 1 },
    ]
    const result = reorder(items, 'w2', 'down')
    expect(result).toEqual([])
  })

  it('returns empty when id is not found', () => {
    const items = [
      { id: 'w1', sort_order: 0 },
      { id: 'w2', sort_order: 1 },
    ]
    const result = reorder(items, 'w999', 'up')
    expect(result).toEqual([])
  })

  it('handles single-item list (always boundary)', () => {
    const items = [{ id: 'w1', sort_order: 0 }]
    expect(reorder(items, 'w1', 'up')).toEqual([])
    expect(reorder(items, 'w1', 'down')).toEqual([])
  })

  it('works with sparse sort_order values', () => {
    const items = [
      { id: 'w1', sort_order: 100 },
      { id: 'w2', sort_order: 500 },
      { id: 'w3', sort_order: 900 },
    ]
    const result = reorder(items, 'w2', 'up')
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: 'w1', sort_order: 500 })
    expect(result).toContainEqual({ id: 'w2', sort_order: 100 })
  })
})
