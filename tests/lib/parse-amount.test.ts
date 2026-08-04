import { describe, it, expect } from 'vitest'
import { parseAmountInput } from '@/lib/parse-amount'

describe('parseAmountInput', () => {
  it('parses a plain amount to minor units', () => {
    expect(parseAmountInput('200')).toBe(20000)
    expect(parseAmountInput('80.50')).toBe(8050)
  })
  it('strips thousands commas', () => {
    expect(parseAmountInput('2,000.50')).toBe(200050)
    expect(parseAmountInput('1,00,000')).toBe(10000000) // Indian grouping too
  })
  it('returns null for empty / whitespace / invalid / negative', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('   ')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('-5')).toBeNull()
  })
  it('treats 0 as a real zero (not null)', () => {
    expect(parseAmountInput('0')).toBe(0)
  })
})
