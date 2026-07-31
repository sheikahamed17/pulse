import type { MoneyEntryRow } from '@/lib/dexie'
import { convertViaRates } from '@/lib/fx'

type Rate = { date: string; target: string; rate: number }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Total spend (out-direction) per rolling 7-day window over the last `weeks`,
 * in the primary currency's minor units. Returns oldest→newest (index 0 = oldest,
 * last = current week). Non-primary entries are FX-converted; unconvertible ones
 * are skipped; income / deleted / future / older-than-window are excluded.
 */
export function weeklySpendBars(
  entries: MoneyEntryRow[],
  primary: string,
  rates: Rate[],
  overrides: Record<string, number>,
  nowIso: string,
  weeks = 8,
): number[] {
  const now = Date.parse(nowIso)
  const buckets = new Array<number>(weeks).fill(0)
  for (const e of entries) {
    if (e.direction !== 'out' || e.deleted_at) continue
    const age = now - Date.parse(e.occurred_at)
    if (age < 0) continue
    const w = Math.floor(age / WEEK_MS)
    if (w >= weeks) continue
    let amount: number
    if (e.currency === primary) {
      amount = e.amount
    } else {
      const conv = convertViaRates(e.amount, e.currency, primary, e.occurred_at, rates, overrides)
      if (!conv) continue
      amount = conv.amount
    }
    buckets[weeks - 1 - w] += amount
  }
  return buckets
}
