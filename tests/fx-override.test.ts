import { describe, it, expect } from 'vitest'
import { convertViaRates } from '@/lib/fx'

// ECB rates array: 1 EUR = rate·target. INR covered; AED NOT covered (the gap).
const rates = [{ date: '2026-07-20', target: 'INR', rate: 90 }]
const occurred = '2026-07-22T10:00:00.000Z'

describe('convertViaRates — manual FX override (fill-the-gap)', () => {
  it('uses the override when ECB has no rate for the currency (AED → INR)', () => {
    // 40000 AED minor = 400 AED. Override 1 EUR = 4 AED → 100 EUR. ECB 1 EUR = 90 INR → 9000 INR → 900000 minor.
    const conv = convertViaRates(40000, 'AED', 'INR', occurred, rates, { AED: 4 })
    expect(conv).not.toBeNull()
    expect(conv!.amount).toBe(900000)
  })

  it('ignores the override when ECB HAS a rate (ECB wins)', () => {
    const ecb = [...rates, { date: '2026-07-20', target: 'AED', rate: 4 }]
    const withOverride = convertViaRates(40000, 'AED', 'INR', occurred, ecb, { AED: 8 }) // wrong override
    const ecbOnly      = convertViaRates(40000, 'AED', 'INR', occurred, ecb)
    expect(withOverride).toEqual(ecbOnly)
  })

  it('returns null when ECB missing AND no override', () => {
    expect(convertViaRates(40000, 'AED', 'INR', occurred, rates)).toBeNull()
    expect(convertViaRates(40000, 'AED', 'INR', occurred, rates, {})).toBeNull()
  })

  it('ignores a non-positive / NaN override value', () => {
    expect(convertViaRates(40000, 'AED', 'INR', occurred, rates, { AED: 0 })).toBeNull()
    expect(convertViaRates(40000, 'AED', 'INR', occurred, rates, { AED: -5 })).toBeNull()
    expect(convertViaRates(40000, 'AED', 'INR', occurred, rates, { AED: NaN })).toBeNull()
  })
})
