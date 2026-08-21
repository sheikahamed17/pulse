import type { MoneyEntryRow } from '@/lib/dexie'

export type AccountLike = {
  id: string
  name: string
  type: 'asset' | 'liability'
  opening_balance: number
  currency: string
  icon: string | null
}

export type NetWorth = {
  net: number
  assets: number
  liabilities: number
  perAccount: {
    id: string
    name: string
    type: 'asset' | 'liability'
    icon: string | null
    balance: number
    currency: string
  }[]
}

export type NetWorthPoint = {
  label: string
  net: number
}

/**
 * Compute the current balance of a single account.
 *
 * Sign conventions:
 * - delta = Σ (direction === 'in' ? +amount : −amount) for entries assigned to this account
 * - asset.current = opening_balance + delta
 * - liability.owed = opening_balance − delta
 *
 * @param account - The account to compute balance for
 * @param entries - All money entries (filtered by account_id inside)
 * @param toAcct - Function to convert entry amount to account currency (e.g. (e) => e.amount). Caller supplies FX conversion.
 * @returns The current balance (in account currency)
 */
export function accountBalance(
  account: AccountLike,
  entries: MoneyEntryRow[],
  toAcct: (e: MoneyEntryRow) => number
): number {
  // Compute delta: sum of (direction === 'in' ? +amount : −amount) for entries with this account_id
  let delta = 0
  for (const entry of entries) {
    // Guard: skip entries with null/undefined account_id
    if (!entry.account_id) continue
    // Skip entries not assigned to this account
    if (entry.account_id !== account.id) continue

    const amountInAcctCurrency = toAcct(entry)
    const sign = entry.direction === 'in' ? 1 : -1
    delta += sign * amountInAcctCurrency
  }

  // Apply sign convention per account type
  if (account.type === 'asset') {
    return account.opening_balance + delta
  } else {
    // liability: owed = opening_balance − delta
    return account.opening_balance - delta
  }
}

/**
 * Compute net worth across all accounts.
 *
 * @param accounts - Array of accounts
 * @param entries - All money entries
 * @param toAcct - Function to convert entry amount to account currency (caller supplies FX conversion)
 * @param toPrimary - Function to convert account balance to primary currency (e.g. (balance, currency) => balance)
 * @returns NetWorth with total assets, liabilities, net, and per-account breakdown
 */
export function netWorth(
  accounts: AccountLike[],
  entries: MoneyEntryRow[],
  toAcct: (e: MoneyEntryRow) => number,
  toPrimary: (amountInAcctCurrency: number, acctCurrency: string) => number
): NetWorth {
  if (accounts.length === 0) {
    return {
      net: 0,
      assets: 0,
      liabilities: 0,
      perAccount: [],
    }
  }

  // Compute balance for each account
  const perAccount = accounts
    .map(account => ({
      id: account.id,
      name: account.name,
      type: account.type,
      icon: account.icon,
      balance: accountBalance(account, entries, toAcct),
      currency: account.currency,
    }))
    // Sort: assets first, then by name
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'asset' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

  // Compute totals
  let assets = 0
  let liabilities = 0

  for (const account of perAccount) {
    const inPrimary = toPrimary(account.balance, account.currency)
    if (account.type === 'asset') {
      assets += inPrimary
    } else {
      liabilities += inPrimary
    }
  }

  const net = assets - liabilities

  // perAccount balances stay in each account's OWN currency (the widget formats
  // each row with that account's symbol/divisor); only the assets/liabilities/net
  // totals are converted to the primary currency above.
  return { net, assets, liabilities, perAccount }
}

/**
 * Compute net worth series over a sequence of periods.
 *
 * For each period P, net worth at the END of that period is calculated as:
 * net = currentNet − rollback(P.to)
 *
 * where rollback(t) = Σ over entries e of (net-worth effect), where:
 * - e.account_id must exist and be in activeAccountIds
 * - e.deleted_at must be null
 * - e.occurred_at >= t (entries at or after the period end)
 * - net-worth effect = e.direction === 'in' ? +toPrimary(e) : −toPrimary(e)
 *
 * Returns one point per period, in the periods' order. Pure; no mutation.
 *
 * @param currentNet - The current net worth (known now)
 * @param entries - All money entries
 * @param activeAccountIds - Set of account IDs to include
 * @param periods - Chronological array of { from, to, label } periods
 * @param toPrimary - Function to convert entry amount to primary currency
 * @returns Array of NetWorthPoint, one per period, same order
 */
export function netWorthSeries(
  currentNet: number,
  entries: MoneyEntryRow[],
  activeAccountIds: Set<string>,
  periods: { from: string; to: string; label: string }[],
  toPrimary: (e: MoneyEntryRow) => number
): NetWorthPoint[] {
  return periods.map(period => {
    // Calculate rollback: sum of net-worth effects of entries at or after period.to
    let rollback = 0
    for (const entry of entries) {
      // Guard: entry must have an account_id in activeAccountIds
      if (!entry.account_id || !activeAccountIds.has(entry.account_id)) continue
      // Skip deleted entries
      if (entry.deleted_at) continue
      // Only count entries at or after period.to
      if (entry.occurred_at < period.to) continue

      const amountInPrimary = toPrimary(entry)
      const sign = entry.direction === 'in' ? 1 : -1
      rollback += sign * amountInPrimary
    }

    // Net at end of period = currentNet − rollback
    const net = currentNet - rollback

    return { label: period.label, net }
  })
}
