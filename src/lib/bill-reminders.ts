import type { ForecastEvent } from '@/lib/forecast'
import { currencySymbol } from '@/lib/currency'

export type BillReminder = {
  id: string
  ruleId: string
  dueDate: string
  title: string
  body: string
  url: string
}

export const LEAD_DAYS = 3

/**
 * Build bill reminders from forecast events.
 * For each event:
 * - dueDate = event.date.slice(0,10) (YYYY-MM-DD, UTC day)
 * - id = `bill-${event.ruleId}-${dueDate}` (dedup key)
 * - daysUntil = whole UTC days between nowIso's day and dueDate (clamped ≥0)
 * - when = 'today' | 'tomorrow' | `in ${daysUntil} days`
 * - amount display: toPrimary(event.amount, event.currency) formatted with PRIMARY currency (÷100, JPY÷1) + currencySymbol
 * - title = `Bill due ${when}`
 * - body = `${symbol}${amountMajor} ${event.description ?? 'recurring bill'}`
 * - url = '/app?tab=money'
 * Pure; no mutation.
 */
export function buildBillReminders(
  outEvents: ForecastEvent[],
  nowIso: string,
  primaryCurrency: string,
  toPrimary: (amount: number, currency: string) => number,
): BillReminder[] {
  const symbol = currencySymbol(primaryCurrency)

  // Extract the date part from nowIso (YYYY-MM-DD)
  const nowDate = nowIso.slice(0, 10)

  return outEvents.map((event) => {
    const dueDate = event.date.slice(0, 10)

    // Calculate whole UTC days between nowDate and dueDate
    const nowDateObj = new Date(nowDate + 'T00:00:00Z')
    const dueDateObj = new Date(dueDate + 'T00:00:00Z')
    const daysUntil = Math.max(
      0,
      Math.floor((dueDateObj.getTime() - nowDateObj.getTime()) / (86400 * 1000)),
    )

    // Determine the "when" text
    const when =
      daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`

    // Convert amount to primary currency
    const convertedAmount = toPrimary(event.amount, event.currency)

    // Format amount: divide by 100 for most currencies, JPY ÷1
    const amountMajor =
      primaryCurrency === 'JPY'
        ? Math.floor(convertedAmount).toLocaleString('en-US')
        : Math.floor(convertedAmount / 100).toLocaleString('en-US')

    const id = `bill-${event.ruleId}-${dueDate}`
    const title = `Bill due ${when}`
    const body = `${symbol}${amountMajor} ${event.description ?? 'recurring bill'}`
    const url = '/app?tab=money'

    return {
      id,
      ruleId: event.ruleId,
      dueDate,
      title,
      body,
      url,
    }
  })
}
