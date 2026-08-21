import { computeNextDue, checkEndConditions } from '@/lib/recurring'
import type { RecurringRuleRow, MoneyEntryRow } from '@/lib/dexie'

// Normalize ISO date to remove milliseconds: "2026-08-15T00:00:00.000Z" → "2026-08-15T00:00:00Z"
function normalizeIsoDate(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, 'Z')
}

export type ForecastEvent = {
  ruleId: string
  date: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
}

export type ForecastSummary = {
  actualIn: number
  actualOut: number
  actualNet: number
  scheduledIn: number
  scheduledOut: number
  projectedNet: number
}

/**
 * Generate upcoming occurrences for recurring rules within a date range.
 * For each rule with is_active === 1 && !deleted_at:
 * - Walk occurrences starting from next_due_at
 * - Stop if checkEndConditions returns is_active === 0
 * - Stop if cursor.next_due_at >= toIso
 * - Emit ForecastEvent if cursor.next_due_at >= fromIso
 * - Safety cap: max 500 iterations per rule
 * Return all events sorted by date ascending.
 */
export function upcomingOccurrences(
  rules: RecurringRuleRow[],
  fromIso: string,
  toIso: string,
): ForecastEvent[] {
  const allEvents: ForecastEvent[] = []
  // Normalize bounds for consistent comparison
  const normalizedFrom = normalizeIsoDate(fromIso)
  const normalizedTo = normalizeIsoDate(toIso)

  for (const rule of rules) {
    // Skip inactive or deleted rules
    if (rule.is_active !== 1 || rule.deleted_at !== null) {
      continue
    }

    // Initialize mutable cursor
    let cursor: RecurringRuleRow = { ...rule }
    let iterCount = 0
    const maxIters = 500

    // Walk occurrences
    while (iterCount < maxIters) {
      iterCount++

      // Check end conditions
      const endCheck = checkEndConditions(cursor)
      if (endCheck.is_active === 0) {
        break
      }

      // Normalize cursor date for comparison
      const normalizedCursorDate = normalizeIsoDate(cursor.next_due_at)

      // Stop if cursor is past the window
      if (normalizedCursorDate >= normalizedTo) {
        break
      }

      // Emit event if cursor is within or after the window start
      if (normalizedCursorDate >= normalizedFrom) {
        allEvents.push({
          ruleId: cursor.id,
          date: normalizedCursorDate,
          amount: cursor.amount,
          currency: cursor.currency,
          direction: cursor.direction,
          category_id: cursor.category_id,
          description: cursor.description,
        })
      }

      // Advance to next occurrence
      cursor = {
        ...cursor,
        next_due_at: computeNextDue(cursor),
        occurrences_so_far: cursor.occurrences_so_far + 1,
      }
    }
  }

  // Sort by date ascending
  allEvents.sort((a, b) => a.date.localeCompare(b.date))
  return allEvents
}

/**
 * Compute cash-flow summary: actual this-month entries + scheduled forecasted events.
 * - actualIn/Out: sum of money entries by direction
 * - actualNet: actualIn - actualOut
 * - scheduledIn/Out: sum of forecast events by direction
 * - projectedNet: (actualIn + scheduledIn) - (actualOut + scheduledOut)
 * Pure; does not mutate inputs.
 */
export function forecastSummary(
  currentMonthEntries: MoneyEntryRow[],
  scheduledThisMonth: ForecastEvent[],
  toPrimary: (amt: number, currency: string) => number,
): ForecastSummary {
  // Sum actuals
  const actualIn = currentMonthEntries
    .filter(e => e.direction === 'in')
    .reduce((sum, e) => sum + toPrimary(e.amount, e.currency), 0)

  const actualOut = currentMonthEntries
    .filter(e => e.direction === 'out')
    .reduce((sum, e) => sum + toPrimary(e.amount, e.currency), 0)

  // Sum scheduled
  const scheduledIn = scheduledThisMonth
    .filter(e => e.direction === 'in')
    .reduce((sum, e) => sum + toPrimary(e.amount, e.currency), 0)

  const scheduledOut = scheduledThisMonth
    .filter(e => e.direction === 'out')
    .reduce((sum, e) => sum + toPrimary(e.amount, e.currency), 0)

  return {
    actualIn,
    actualOut,
    actualNet: actualIn - actualOut,
    scheduledIn,
    scheduledOut,
    projectedNet: actualIn + scheduledIn - actualOut - scheduledOut,
  }
}
