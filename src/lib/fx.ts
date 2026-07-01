import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'

// Currencies with no minor unit (JPY's "yen" is the base; no "sen" in modern use).
// Sheik's 9-currency set: JPY is the only zero-minor-unit currency.
const ZERO_MINOR_UNIT_CURRENCIES = new Set(['JPY'])

function minorUnitMultiplier(currency: string): number {
  return ZERO_MINOR_UNIT_CURRENCIES.has(currency) ? 1 : 100
}

// Find the most-recent date ≤ asOfDate with a rate for the given target.
// `base` is implicitly 'EUR' (ECB's reference).
async function freshestRate(
  db: Kysely<DB>,
  target: string,
  asOfDate: string,                             // 'YYYY-MM-DD'
): Promise<{ date: string; rate: number } | null> {
  const row = await db
    .selectFrom('fx_rates')
    .where('target', '=', target)
    .where('date', '<=', asOfDate)
    .orderBy('date', 'desc')
    .limit(1)
    .selectAll()
    .executeTakeFirst()
  return row ? { date: row.date, rate: row.rate } : null
}

// Convert `amount` (smallest unit in `currency`) to `primary` (smallest unit).
// Returns null if any required rate is missing — caller decides UX.
export async function convertToPrimary(
  db: Kysely<DB>,
  amount: number,
  currency: string,
  primary: string,
  occurredAt: string,                           // ISO 8601
): Promise<{ amount: number; rateDate: string } | null> {
  if (currency === primary) {
    return { amount, rateDate: occurredAt.slice(0, 10) }
  }

  const asOfDate = occurredAt.slice(0, 10)

  // EUR→currency rate (1 EUR = `rate` units of currency)
  const eurToCurrency = currency === 'EUR'
    ? { date: asOfDate, rate: 1 }
    : await freshestRate(db, currency, asOfDate)
  if (!eurToCurrency) return null

  // EUR→primary rate
  const eurToPrimary = primary === 'EUR'
    ? { date: asOfDate, rate: 1 }
    : await freshestRate(db, primary, asOfDate)
  if (!eurToPrimary) return null

  // Convert smallest-unit → major-unit → EUR → primary major → primary smallest
  const currencyDivisor = minorUnitMultiplier(currency)
  const primaryMultiplier = minorUnitMultiplier(primary)

  const currencyMajor = amount / currencyDivisor             // e.g., 9050 paise → 90.5 INR
  const eurMajor      = currencyMajor / eurToCurrency.rate   // 90.5 INR / 90.5 (EUR→INR) = 1.0 EUR
  const primaryMajor  = eurMajor * eurToPrimary.rate         // 1.0 EUR × 1.08 (EUR→USD) = 1.08 USD
  const primaryMinor  = Math.round(primaryMajor * primaryMultiplier)   // 1.08 × 100 = 108 cents

  // Use the older of the two rate dates as the disclosed rateDate
  const rateDate = eurToCurrency.date < eurToPrimary.date ? eurToCurrency.date : eurToPrimary.date

  return { amount: primaryMinor, rateDate }
}

// Client-side conversion using already-fetched FxRateRow[] (no DB access).
// Same math as convertToPrimary but accepts the rate set directly.
export function convertViaRates(
  amount: number,
  currency: string,
  primary: string,
  occurredAt: string,
  rates: Array<{ date: string; target: string; rate: number }>,
): { amount: number; rateDate: string } | null {
  if (currency === primary) {
    return { amount, rateDate: occurredAt.slice(0, 10) }
  }

  const asOfDate = occurredAt.slice(0, 10)

  function freshest(target: string) {
    if (target === 'EUR') return { date: asOfDate, rate: 1 }
    let best: { date: string; rate: number } | null = null
    for (const r of rates) {
      if (r.target !== target) continue
      if (r.date > asOfDate) continue
      if (!best || r.date > best.date) best = { date: r.date, rate: r.rate }
    }
    return best
  }

  const eurToCurrency = freshest(currency)
  const eurToPrimary  = freshest(primary)
  if (!eurToCurrency || !eurToPrimary) return null

  const ZERO_MINOR = new Set(['JPY'])
  const div = (c: string) => ZERO_MINOR.has(c) ? 1 : 100

  const major = amount / div(currency)
  const eur = major / eurToCurrency.rate
  const primaryMajor = eur * eurToPrimary.rate
  const primaryMinor = Math.round(primaryMajor * div(primary))

  const rateDate = eurToCurrency.date < eurToPrimary.date ? eurToCurrency.date : eurToPrimary.date
  return { amount: primaryMinor, rateDate }
}

export type ConversionResult = Awaited<ReturnType<typeof convertToPrimary>>
