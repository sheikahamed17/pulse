import { describe, it, expect } from 'vitest'
import { allocatedTotal, splitRemaining, isSplitValid } from './split-transaction'

describe('split-transaction', () => {
  const a = [
    { category_id: 'g', amount: 1500 },
    { category_id: 'h', amount: 700 },
    { category_id: null, amount: 200 },
  ]

  it('sums allocations', () => {
    expect(allocatedTotal(a)).toBe(2400)
    expect(allocatedTotal([])).toBe(0)
  })

  it('computes remaining (total − allocated)', () => {
    expect(splitRemaining(2400, a)).toBe(0)
    expect(splitRemaining(3000, a)).toBe(600)
    expect(splitRemaining(2000, a)).toBe(-400) // over-allocated
  })

  it('is valid only with ≥2 parts, each amount > 0, and an exact sum', () => {
    expect(isSplitValid(2400, a)).toBe(true)
    expect(isSplitValid(2401, a)).toBe(false)                                       // under
    expect(isSplitValid(2399, a)).toBe(false)                                       // over
    expect(isSplitValid(2400, [{ category_id: 'g', amount: 2400 }])).toBe(false)     // only 1 part
    expect(isSplitValid(2400, [{ category_id: 'g', amount: 2400 }, { category_id: 'h', amount: 0 }])).toBe(false) // zero part
    expect(isSplitValid(2400, [{ category_id: 'g', amount: 2500 }, { category_id: 'h', amount: -100 }])).toBe(false) // negative part
  })
})
