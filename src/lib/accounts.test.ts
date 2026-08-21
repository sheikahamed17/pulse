import { describe, it, expect } from 'vitest'
import { accountBalance, netWorth } from './accounts'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { AccountLike } from './accounts'

const row = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'x',
  user_id: 'u',
  amount: 0,
  currency: 'INR',
  direction: 'out',
  category_id: null,
  description: null,
  occurred_at: '2026-08-01T00:00:00Z',
  source: 'manual',
  receipt_key: null,
  raw_input: null,
  recurring_rule_id: null,
  merchant: null,
  tags: [],
  account_id: null,
  field_hlcs: {},
  deleted_at: null,
  created_at: '',
  updated_at: '',
  ...o,
})

const toAcct = (e: MoneyEntryRow) => e.amount
const toPrimary = (n: number) => n

describe('accountBalance', () => {
  it('asset: opening 500000, one out 20000, one in 5000 => 485000', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 500000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
      row({ id: '2', account_id: 'asset1', amount: 5000, direction: 'in' }),
    ]
    expect(accountBalance(account, entries, toAcct)).toBe(485000)
  })

  it('liability: opening 200000, one out 50000 (spend) => 250000 owed', () => {
    const account: AccountLike = {
      id: 'cc1',
      name: 'Credit Card',
      type: 'liability',
      opening_balance: 200000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'cc1', amount: 50000, direction: 'out' }),
    ]
    expect(accountBalance(account, entries, toAcct)).toBe(250000)
  })

  it('liability: after payment (in 30000), owed drops to 220000', () => {
    const account: AccountLike = {
      id: 'cc1',
      name: 'Credit Card',
      type: 'liability',
      opening_balance: 200000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'cc1', amount: 50000, direction: 'out' }),
      row({ id: '2', account_id: 'cc1', amount: 30000, direction: 'in' }),
    ]
    expect(accountBalance(account, entries, toAcct)).toBe(220000)
  })

  it('account with no entries returns exactly opening_balance', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Savings',
      type: 'asset',
      opening_balance: 1000000,
      currency: 'INR',
      icon: null,
    }
    expect(accountBalance(account, [], toAcct)).toBe(1000000)
  })

  it('ignores entries with different account_id', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 500000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
      row({ id: '2', account_id: 'asset2', amount: 100000, direction: 'in' }),
    ]
    expect(accountBalance(account, entries, toAcct)).toBe(480000)
  })

  it('ignores entries with null account_id', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 500000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
      row({ id: '2', account_id: null, amount: 100000, direction: 'in' }),
    ]
    expect(accountBalance(account, entries, toAcct)).toBe(480000)
  })

  it('ignores entries with undefined account_id', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 500000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
      row({ id: '2', account_id: undefined as unknown as string | null, amount: 100000, direction: 'in' }),
    ]
    expect(accountBalance(account, entries, toAcct)).toBe(480000)
  })

  it('does not mutate inputs', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 500000,
      currency: 'INR',
      icon: null,
    }
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
    ]
    const originalEntries = [...entries]
    const originalAccount = { ...account }
    accountBalance(account, entries, toAcct)
    expect(account).toEqual(originalAccount)
    expect(entries).toEqual(originalEntries)
  })
})

describe('netWorth', () => {
  it('1 asset (485000) + 1 liability (250000) => assets 485000, liabilities 250000, net 235000', () => {
    const accounts: AccountLike[] = [
      {
        id: 'asset1',
        name: 'Checking',
        type: 'asset',
        opening_balance: 500000,
        currency: 'INR',
        icon: '🏦',
      },
      {
        id: 'cc1',
        name: 'Credit Card',
        type: 'liability',
        opening_balance: 200000,
        currency: 'INR',
        icon: '💳',
      },
    ]
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
      row({ id: '2', account_id: 'asset1', amount: 5000, direction: 'in' }),
      row({ id: '3', account_id: 'cc1', amount: 50000, direction: 'out' }),
    ]
    const result = netWorth(accounts, entries, toAcct, toPrimary)
    expect(result.assets).toBe(485000)
    expect(result.liabilities).toBe(250000)
    expect(result.net).toBe(235000)
    expect(result.perAccount).toHaveLength(2)
    expect(result.perAccount[0].type).toBe('asset')
    expect(result.perAccount[1].type).toBe('liability')
  })

  it('perAccount sorted assets-first then by name', () => {
    const accounts: AccountLike[] = [
      {
        id: 'cc1',
        name: 'Visa',
        type: 'liability',
        opening_balance: 100000,
        currency: 'INR',
        icon: null,
      },
      {
        id: 'asset2',
        name: 'Savings',
        type: 'asset',
        opening_balance: 300000,
        currency: 'INR',
        icon: null,
      },
      {
        id: 'asset1',
        name: 'Checking',
        type: 'asset',
        opening_balance: 200000,
        currency: 'INR',
        icon: null,
      },
    ]
    const result = netWorth(accounts, [], toAcct, toPrimary)
    expect(result.perAccount.map(a => a.id)).toEqual(['asset1', 'asset2', 'cc1'])
  })

  it('empty accounts => {net:0, assets:0, liabilities:0, perAccount:[]}', () => {
    const result = netWorth([], [], toAcct, toPrimary)
    expect(result).toEqual({
      net: 0,
      assets: 0,
      liabilities: 0,
      perAccount: [],
    })
  })

  it('does not mutate inputs', () => {
    const accounts: AccountLike[] = [
      {
        id: 'asset1',
        name: 'Checking',
        type: 'asset',
        opening_balance: 500000,
        currency: 'INR',
        icon: null,
      },
    ]
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out' }),
    ]
    const originalAccounts = JSON.parse(JSON.stringify(accounts))
    const originalEntries = JSON.parse(JSON.stringify(entries))
    netWorth(accounts, entries, toAcct, toPrimary)
    expect(accounts).toEqual(originalAccounts)
    expect(entries).toEqual(originalEntries)
  })
})
