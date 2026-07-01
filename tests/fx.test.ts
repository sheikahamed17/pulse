import { describe, it, expect } from 'vitest'
import { convertToPrimary, convertViaRates } from '@/lib/fx'

function makeFakeDb(rates: Array<{ date: string; target: string; rate: number }>) {
  return {
    selectFrom: (_table: string) => ({
      where: (col: string, _op: string, val: unknown) => {
        let filtered = rates
        if (col === 'target') filtered = filtered.filter(r => r.target === val)
        return {
          where: (col2: string, op2: string, val2: unknown) => {
            let f2 = filtered
            if (col2 === 'date' && op2 === '<=') f2 = f2.filter(r => r.date <= (val2 as string))
            return {
              orderBy: () => ({
                limit: () => ({
                  selectAll: () => ({
                    executeTakeFirst: async () => f2.sort((a, b) => b.date.localeCompare(a.date))[0],
                  }),
                }),
              }),
            }
          },
        }
      },
    }),
  }
}

describe('convertToPrimary', () => {
  it('returns identity when currency === primary', async () => {
    const db = makeFakeDb([])
    const out = await convertToPrimary(db as never, 10000, 'INR', 'INR', '2026-06-18T00:00:00.000Z')
    expect(out).toEqual({ amount: 10000, rateDate: '2026-06-18' })
  })

  it('converts via cross-rate through EUR', async () => {
    // EUR→INR = 90.5, EUR→USD = 1.08 → INR→USD = 1.08/90.5
    // 9050 paise (₹90.5) → in USD: (90.5 / 90.5) * 1.08 = $1.08 = 108 cents
    const db = makeFakeDb([
      { date: '2026-06-18', target: 'INR', rate: 90.5 },
      { date: '2026-06-18', target: 'USD', rate: 1.08 },
    ])
    const out = await convertToPrimary(db as never, 9050, 'INR', 'USD', '2026-06-18T00:00:00.000Z')
    expect(out).not.toBeNull()
    expect(out!.amount).toBe(108)                     // 108 cents
    expect(out!.rateDate).toBe('2026-06-18')
  })

  it('handles EUR as the source currency (no cross)', async () => {
    const db = makeFakeDb([{ date: '2026-06-18', target: 'INR', rate: 90.5 }])
    // €1 = 100 cents → INR amount = 100 * 90.5 = 9050 paise
    const out = await convertToPrimary(db as never, 100, 'EUR', 'INR', '2026-06-18T00:00:00.000Z')
    expect(out!.amount).toBe(9050)
  })

  it('handles EUR as the target currency (no cross)', async () => {
    const db = makeFakeDb([{ date: '2026-06-18', target: 'INR', rate: 90.5 }])
    // ₹9050 paise → EUR: 9050 / 90.5 / 100 = 1.0 EUR = 100 cents
    const out = await convertToPrimary(db as never, 9050, 'INR', 'EUR', '2026-06-18T00:00:00.000Z')
    expect(out!.amount).toBe(100)
  })

  it('returns null when a required rate is missing', async () => {
    const db = makeFakeDb([{ date: '2026-06-18', target: 'INR', rate: 90.5 }])
    const out = await convertToPrimary(db as never, 100, 'XYZ', 'USD', '2026-06-18T00:00:00.000Z')
    expect(out).toBeNull()
  })

  it('handles JPY (no minor unit, divisor 1 not 100)', async () => {
    // EUR→JPY = 171.42, EUR→USD = 1.08 → JPY→USD = 1.08/171.42
    // 1500 yen → in USD cents: 1500 / 171.42 * 1.08 * 100 ≈ 945 cents (=$9.45)
    const db = makeFakeDb([
      { date: '2026-06-18', target: 'JPY', rate: 171.42 },
      { date: '2026-06-18', target: 'USD', rate: 1.08 },
    ])
    const out = await convertToPrimary(db as never, 1500, 'JPY', 'USD', '2026-06-18T00:00:00.000Z')
    expect(out!.amount).toBeGreaterThan(900)
    expect(out!.amount).toBeLessThan(1000)
  })

  it('uses the most-recent rate ≤ requested date (stale weekend)', async () => {
    const db2 = makeFakeDb([
      { date: '2026-06-16', target: 'USD', rate: 1.0800 },
    ])
    const out = await convertToPrimary(db2 as never, 100, 'EUR', 'USD', '2026-06-18T00:00:00.000Z')
    expect(out!.rateDate).toBe('2026-06-16')
  })
})

describe('convertViaRates (client-side)', () => {
  it('converts identical to convertToPrimary', () => {
    const out = convertViaRates(9050, 'INR', 'USD', '2026-06-18T00:00:00.000Z', [
      { date: '2026-06-18', target: 'INR', rate: 90.5 },
      { date: '2026-06-18', target: 'USD', rate: 1.08 },
    ])
    expect(out!.amount).toBe(108)
  })

  it('returns null when a target rate is missing', () => {
    const out = convertViaRates(100, 'XYZ', 'USD', '2026-06-18T00:00:00.000Z', [
      { date: '2026-06-18', target: 'USD', rate: 1.08 },
    ])
    expect(out).toBeNull()
  })
})
