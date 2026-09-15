import { describe, it, expect } from 'vitest'
import { cardSummary } from './card-summary'
import type { AccountLike } from '@/lib/accounts'
import type { MoneyEntryRow } from '@/lib/dexie'

const card: AccountLike = { id: 'card1', name: 'Tata Neu', type: 'liability', opening_balance: 0, currency: 'INR', icon: null }
const NOW = '2026-09-15T12:00:00Z'
const TZ = 'Asia/Kolkata'
const identity = (e: MoneyEntryRow) => e.amount

function money(p: Partial<MoneyEntryRow> & { id: string; amount: number }): MoneyEntryRow {
  return {
    id: p.id, user_id: 'u1', amount: p.amount, currency: 'INR',
    direction: p.direction ?? 'out', category_id: null, description: null,
    occurred_at: p.occurred_at ?? '2026-09-10T06:00:00Z', source: 'manual',
    receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null,
    tags: [], account_id: p.account_id ?? null, field_hlcs: {},
    deleted_at: p.deleted_at ?? null, created_at: '', updated_at: '',
  } as MoneyEntryRow
}

describe('cardSummary', () => {
  it('computes owed, this-month spend, and recent payments', () => {
    const entries = [
      money({ id: 'a', amount: 1500, account_id: 'card1' }),               // this-month card spend
      money({ id: 'b', amount: 700, account_id: 'card1' }),                // this-month card spend
      money({ id: 'c', amount: 999, account_id: 'bank1' }),               // other account → ignored
    ]
    const transfers = [
      { id: 't1', from_account_id: 'bank1', to_account_id: 'card1', amount: 1000, currency: 'INR', occurred_at: '2026-09-12T00:00:00Z' },
      { id: 't2', from_account_id: 'bank1', to_account_id: 'other', amount: 500, currency: 'INR', occurred_at: '2026-09-11T00:00:00Z' },
    ]
    const s = cardSummary(card, entries, transfers, NOW, TZ, identity)
    // owed (liability) = opening − delta; delta = −1500 −700 + 1000(payment) = −1200 → owed 1200
    expect(s.owed).toBe(1200)
    expect(s.monthSpend).toBe(2200)
    expect(s.recentPayments.map(p => p.id)).toEqual(['t1']) // only the payment INTO card1
    expect(s.recentPayments[0].amount).toBe(1000)
  })

  it('month spend excludes last-month and deleted entries', () => {
    const entries = [
      money({ id: 'lastmo', amount: 500, account_id: 'card1', occurred_at: '2026-08-10T06:00:00Z' }),
      money({ id: 'del', amount: 888, account_id: 'card1', deleted_at: '2026-09-11T00:00:00Z' }),
      money({ id: 'income', amount: 300, account_id: 'card1', direction: 'in' }), // not a spend
    ]
    const s = cardSummary(card, entries, [], NOW, TZ, identity)
    expect(s.monthSpend).toBe(0)
  })

  it('orders payments most-recent-first and caps them', () => {
    const transfers = [1, 2, 3, 4, 5, 6].map(n => ({
      id: `t${n}`, from_account_id: 'bank1', to_account_id: 'card1', amount: n * 100,
      currency: 'INR', occurred_at: `2026-09-0${n}T00:00:00Z`,
    }))
    const s = cardSummary(card, [], transfers, NOW, TZ, identity, 3)
    expect(s.recentPayments.map(p => p.id)).toEqual(['t6', 't5', 't4']) // desc, capped at 3
  })
})
