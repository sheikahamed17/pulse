import { describe, it, expect } from 'vitest'
import { convertViaRates, convertToPrimary } from '@/lib/fx'

// Minimal fx_rates DB stub: freshestRate() does
// .selectFrom('fx_rates').where('target','=',target).where('date','<=',asOf).orderBy().limit().selectAll().executeTakeFirst()
// Return an EUR→target row for targets present in rateMap; undefined (a gap) otherwise.
function fakeFxDb(rateMap: Record<string, number>) {
  return {
    selectFrom: () => ({
      where: (_c: string, _o: string, target: string) => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              selectAll: () => ({
                executeTakeFirst: async () => (target in rateMap ? { date: '2026-07-20', target, rate: rateMap[target] } : undefined),
              }),
            }),
          }),
        }),
      }),
    }),
  } as never
}

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

describe('convertToPrimary — manual FX override (fill-the-gap, DB path)', () => {
  const db = fakeFxDb({ INR: 90 }) // ECB has INR; AED is a gap

  it('returns null for a gap currency with no override', async () => {
    expect(await convertToPrimary(db, 40000, 'AED', 'INR', occurred)).toBeNull()
  })

  it('uses the override for the gap currency, triangulating via the ECB primary leg', async () => {
    // 400 AED / (1 EUR = 4 AED) = 100 EUR × (1 EUR = 90 INR) = 9000 INR → 900000 minor
    const conv = await convertToPrimary(db, 40000, 'AED', 'INR', occurred, { AED: 4 })
    expect(conv?.amount).toBe(900000)
  })

  it('ECB wins when present (override ignored for a covered currency)', async () => {
    const dbWithUsd = fakeFxDb({ INR: 90, USD: 1.1 })
    const withOv = await convertToPrimary(dbWithUsd, 11000, 'USD', 'INR', occurred, { USD: 2 })
    const ecb    = await convertToPrimary(dbWithUsd, 11000, 'USD', 'INR', occurred)
    expect(withOv).toEqual(ecb)
  })
})
