import { accountBalance, type AccountLike, type TransferLike } from '@/lib/accounts'
import { yearMonthInTz } from '@/lib/budget-exec'
import type { MoneyEntryRow } from '@/lib/dexie'

export type CardPayment = { id: string; amount: number; occurred_at: string }
export type CardSummary = {
  owed: number                    // account-currency minor units (from accountBalance)
  monthSpend: number              // this-month out-spend charged to this card (account currency)
  recentPayments: CardPayment[]   // transfers INTO this card, most recent first, capped
}

type TransferInput = TransferLike & { occurred_at?: string | null }

/**
 * Summarise a single liability (card) account for the "Cards & debts" view.
 * Pure: owed via accountBalance (a liability's owed = opening − delta, so spend
 * raises it and payments lower it), this-month spend, and recent payments made
 * TO the card (transfers whose to_account_id is this card). Public holidays /
 * statement cycles are not modelled (v1 uses the calendar month in the user tz).
 */
export function cardSummary(
  account: AccountLike,
  entries: MoneyEntryRow[],
  transfers: TransferInput[],
  nowIso: string,
  tz: string,
  toAcct: (e: MoneyEntryRow) => number,
  paymentsCap = 5,
): CardSummary {
  const owed = accountBalance(account, entries, transfers, toAcct)

  const monthKey = yearMonthInTz(nowIso, tz)
  let monthSpend = 0
  for (const e of entries) {
    if (e.deleted_at) continue
    if (e.account_id !== account.id) continue
    if (e.direction !== 'out') continue
    if (yearMonthInTz(e.occurred_at, tz) !== monthKey) continue
    monthSpend += toAcct(e)
  }

  const recentPayments = transfers
    .filter(t => !t.deleted_at && t.to_account_id === account.id)
    .map(t => ({ id: t.id, amount: t.amount, occurred_at: t.occurred_at ?? '' }))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, paymentsCap)

  return { owed, monthSpend, recentPayments }
}
