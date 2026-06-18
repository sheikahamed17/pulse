import { addDays, addWeeks, addMonths, addYears } from 'date-fns'

export type RecurringRule = {
  id: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  anchor_at: string
  next_due_at: string
  occurrences_so_far: number
  end_condition_kind: 'never' | 'until' | 'count'
  end_until: string | null
  end_count: number | null
  is_active: number
}

// Compute the NEXT ISO timestamp after rule.next_due_at, respecting period + interval.
//
// For monthly/yearly we re-anchor day-of-month from anchor_at so that a rule with
// anchor=Jan 31 produces 31 → 28(or 29) → 31 → 30 → 31 across the year, rather than
// permanently collapsing to 28 after the first Feb hop.
export function computeNextDue(rule: RecurringRule): string {
  const cur = new Date(rule.next_due_at)
  const interval = rule.interval_count

  switch (rule.period) {
    case 'daily':
      return addDays(cur, interval).toISOString()

    case 'weekly':
      return addWeeks(cur, interval).toISOString()

    case 'monthly': {
      const anchor = new Date(rule.anchor_at)
      const anchorDom = anchor.getUTCDate()

      const year = cur.getUTCFullYear()
      const month = cur.getUTCMonth()
      const nextMonth = month + interval
      const nextYear = year + Math.floor(nextMonth / 12)
      const nextMonthInYear = nextMonth % 12

      // Clamp DOM before creating the date
      const targetLastDay = lastDayOfMonthUTC(nextYear, nextMonthInYear)
      const dom = Math.min(anchorDom, targetLastDay)

      return new Date(Date.UTC(nextYear, nextMonthInYear, dom, cur.getUTCHours(), cur.getUTCMinutes(), cur.getUTCSeconds(), cur.getUTCMilliseconds())).toISOString()
    }

    case 'yearly': {
      const anchor = new Date(rule.anchor_at)
      const anchorDom = anchor.getUTCDate()
      const anchorMonth = anchor.getUTCMonth()

      const year = cur.getUTCFullYear()
      const nextYear = year + interval

      // Clamp DOM before creating the date
      const targetLastDay = lastDayOfMonthUTC(nextYear, anchorMonth)
      const dom = Math.min(anchorDom, targetLastDay)

      return new Date(Date.UTC(nextYear, anchorMonth, dom, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds())).toISOString()
    }
  }
}

// Returns the last day-of-month for a given UTC year+month, computed via the
// "day 0 of next month" trick which is timezone-stable.
function lastDayOfMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function checkEndConditions(rule: RecurringRule): { is_active: number } {
  if (rule.end_condition_kind === 'never') return { is_active: 1 }
  if (rule.end_condition_kind === 'until') {
    if (!rule.end_until) return { is_active: 1 }
    return { is_active: rule.next_due_at > rule.end_until ? 0 : 1 }
  }
  if (rule.end_condition_kind === 'count') {
    if (rule.end_count == null) return { is_active: 1 }
    return { is_active: rule.occurrences_so_far >= rule.end_count ? 0 : 1 }
  }
  return { is_active: 1 }
}
