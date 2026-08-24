import type { MoneyEntryRow } from '@/lib/dexie'
import type { AccountLike, TransferLike } from './accounts'
import { accountBalance } from './accounts'

export type GoalLike = {
  id: string
  name: string
  target_amount: number
  currency: string
  icon: string | null
  account_id: string | null
  saved_amount: number
  target_date: string | null
}

export type GoalProgress = {
  current: number
  pct: number
  remaining: number
}

/**
 * Compute the progress of a savings goal.
 *
 * If goal.account_id is set and a matching account exists in accounts,
 * current = accountBalance(that account, entries, transfers, toAcct).
 * Otherwise, current = goal.saved_amount (manual tracking).
 *
 * pct = goal.target_amount > 0 ? clamp((current / goal.target_amount) * 100, 0, 100) : 0
 * remaining = Math.max(0, goal.target_amount − current)
 *
 * Pure, no mutation.
 *
 * @param goal - The goal to compute progress for
 * @param accounts - All accounts
 * @param entries - All money entries
 * @param transfers - All transfers
 * @param toAcct - Function to convert entry amount to account currency (e.g. (e) => e.amount)
 * @returns GoalProgress with current, pct, remaining
 */
export function goalProgress(
  goal: GoalLike,
  accounts: AccountLike[],
  entries: MoneyEntryRow[],
  transfers: TransferLike[],
  toAcct: (e: MoneyEntryRow) => number
): GoalProgress {
  // Determine current amount
  let current = goal.saved_amount
  if (goal.account_id) {
    // Try to find a matching account
    const account = accounts.find(a => a.id === goal.account_id)
    if (account) {
      current = accountBalance(account, entries, transfers, toAcct)
    }
    // If account not found, fall back to saved_amount
  }

  // Helper to clamp a value between 0 and 100
  const clamp = (v: number, lo: number, hi: number): number => {
    return Math.min(hi, Math.max(lo, v))
  }

  // Calculate percentage
  const pct = goal.target_amount > 0 ? clamp((current / goal.target_amount) * 100, 0, 100) : 0

  // Calculate remaining
  const remaining = Math.max(0, goal.target_amount - current)

  return { current, pct, remaining }
}
