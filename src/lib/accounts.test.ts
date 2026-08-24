import { describe, it, expect } from 'vitest'
import { accountBalance, netWorth, netWorthSeries } from './accounts'
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
    expect(accountBalance(account, entries, [], toAcct)).toBe(485000)
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
    expect(accountBalance(account, entries, [], toAcct)).toBe(250000)
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
    expect(accountBalance(account, entries, [], toAcct)).toBe(220000)
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
    expect(accountBalance(account, [], [], toAcct)).toBe(1000000)
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
    expect(accountBalance(account, entries, [], toAcct)).toBe(480000)
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
    expect(accountBalance(account, entries, [], toAcct)).toBe(480000)
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
    expect(accountBalance(account, entries, [], toAcct)).toBe(480000)
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
    accountBalance(account, entries, [], toAcct)
    expect(account).toEqual(originalAccount)
    expect(entries).toEqual(originalEntries)
  })

  it('transfer OUT: asset opening 100000, transfer from A 30000 => 70000', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 100000,
      currency: 'INR',
      icon: null,
    }
    const transfers = [
      { id: 't1', from_account_id: 'asset1', to_account_id: 'asset2', amount: 30000, currency: 'INR', deleted_at: null },
    ]
    expect(accountBalance(account, [], transfers, toAcct)).toBe(70000)
  })

  it('transfer IN: asset opening 100000, transfer to A 20000 => 120000', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 100000,
      currency: 'INR',
      icon: null,
    }
    const transfers = [
      { id: 't1', from_account_id: 'asset2', to_account_id: 'asset1', amount: 20000, currency: 'INR', deleted_at: null },
    ]
    expect(accountBalance(account, [], transfers, toAcct)).toBe(120000)
  })

  it('transfer IN to liability reduces owed: card opening 200000, transfer in 50000 => 150000', () => {
    const account: AccountLike = {
      id: 'card1',
      name: 'Credit Card',
      type: 'liability',
      opening_balance: 200000,
      currency: 'INR',
      icon: null,
    }
    const transfers = [
      { id: 't1', from_account_id: 'asset1', to_account_id: 'card1', amount: 50000, currency: 'INR', deleted_at: null },
    ]
    expect(accountBalance(account, [], transfers, toAcct)).toBe(150000)
  })

  it('deleted transfer is ignored', () => {
    const account: AccountLike = {
      id: 'asset1',
      name: 'Checking',
      type: 'asset',
      opening_balance: 100000,
      currency: 'INR',
      icon: null,
    }
    const transfers = [
      { id: 't1', from_account_id: 'asset1', to_account_id: 'asset2', amount: 30000, currency: 'INR', deleted_at: '2026-08-24T00:00:00Z' },
    ]
    expect(accountBalance(account, [], transfers, toAcct)).toBe(100000)
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
    const result = netWorth(accounts, entries, [], toAcct, toPrimary)
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
    const result = netWorth(accounts, [], [], toAcct, toPrimary)
    expect(result.perAccount.map(a => a.id)).toEqual(['asset1', 'asset2', 'cc1'])
  })

  it('empty accounts => {net:0, assets:0, liabilities:0, perAccount:[]}', () => {
    const result = netWorth([], [], [], toAcct, toPrimary)
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
    netWorth(accounts, entries, [], toAcct, toPrimary)
    expect(accounts).toEqual(originalAccounts)
    expect(entries).toEqual(originalEntries)
  })

  it('netWorth with transfer A→card leaves net unchanged: A drops 50000, card owed drops 50000', () => {
    const accts: AccountLike[] = [
      {
        id: 'asset1',
        name: 'Asset',
        type: 'asset',
        opening_balance: 200000,
        currency: 'INR',
        icon: null,
      },
      {
        id: 'card1',
        name: 'Card',
        type: 'liability',
        opening_balance: 100000,
        currency: 'INR',
        icon: null,
      },
    ]
    // Without transfer: net = (200000) - (100000) = 100000
    const withoutTransfer = netWorth(accts, [], [], toAcct, toPrimary)
    expect(withoutTransfer.net).toBe(100000)

    // With transfer A→card 50000: A = 200000-50000=150000, card owed = 100000-50000=50000
    // net = (150000) - (50000) = 100000 (unchanged)
    const transfers = [
      { id: 't1', from_account_id: 'asset1', to_account_id: 'card1', amount: 50000, currency: 'INR', deleted_at: null },
    ]
    const withTransfer = netWorth(accts, [], transfers, toAcct, toPrimary)
    expect(withTransfer.net).toBe(100000)
    expect(withTransfer.net).toBe(withoutTransfer.net)
  })

  it('INVARIANT: a transfer does not change the net-worth series (via currentNet invariance)', () => {
    // The series is driven by currentNet + money entries. A transfer is NOT a
    // series input; the ONLY way it could perturb the series is by changing
    // currentNet. So derive currentNet BOTH ways (with/without a transfer)
    // through netWorth, then feed each into netWorthSeries. If a sign bug made
    // a transfer move net worth, the two currentNets — and the two series —
    // would differ, and this test would fail.
    const accts: AccountLike[] = [
      { id: 'asset1', name: 'Asset', type: 'asset', opening_balance: 200000, currency: 'INR', icon: null },
      { id: 'card1', name: 'Card', type: 'liability', opening_balance: 100000, currency: 'INR', icon: null },
    ]
    const entries = [
      row({ id: '1', account_id: 'asset1', amount: 20000, direction: 'out', occurred_at: '2026-08-15T00:00:00Z' }),
    ]
    const transfers = [
      { id: 't1', from_account_id: 'asset1', to_account_id: 'card1', amount: 50000, currency: 'INR', deleted_at: null },
    ]
    const activeAccountIds = new Set(['asset1', 'card1'])
    const periods = [
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimaryEntry = (e: MoneyEntryRow) => e.amount

    const netWithout = netWorth(accts, entries, [], toAcct, toPrimary).net
    const netWith = netWorth(accts, entries, transfers, toAcct, toPrimary).net

    const seriesWithout = netWorthSeries(netWithout, entries, activeAccountIds, periods, toPrimaryEntry)
    const seriesWith = netWorthSeries(netWith, entries, activeAccountIds, periods, toPrimaryEntry)

    expect(seriesWith).toEqual(seriesWithout)
  })
})

describe('netWorthSeries', () => {
  it('rollback example: currentNet=100000, out 20000 in current month, in 50000 in last month', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries = [
      row({
        id: '1',
        account_id: 'a',
        amount: 20000,
        direction: 'out',
        occurred_at: '2026-08-15T00:00:00Z',
      }),
      row({
        id: '2',
        account_id: 'a',
        amount: 50000,
        direction: 'in',
        occurred_at: '2026-07-15T00:00:00Z',
      }),
    ]
    const periods = [
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const result = netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(result).toHaveLength(2)
    // Jul: rollback includes Aug 20000 out => rollback = -20000 => net = 100000 - (-20000) = 120000
    expect(result[0]).toEqual({ label: 'Jul', net: 120000 })
    // Aug: rollback includes nothing after Aug end => rollback = 0 => net = 100000 - 0 = 100000
    expect(result[1]).toEqual({ label: 'Aug', net: 100000 })
  })

  it('ignores entries on inactive accounts', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries = [
      row({
        id: '1',
        account_id: 'a',
        amount: 20000,
        direction: 'out',
        occurred_at: '2026-08-15T00:00:00Z',
      }),
      row({
        id: '2',
        account_id: 'b', // inactive
        amount: 50000,
        direction: 'in',
        occurred_at: '2026-07-15T00:00:00Z',
      }),
    ]
    const periods = [
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const result = netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(result).toHaveLength(2)
    // Jul: only the 20000 out from Aug counts => rollback = -20000 => net = 120000
    expect(result[0]).toEqual({ label: 'Jul', net: 120000 })
    // Aug: nothing after Aug end => net = 100000
    expect(result[1]).toEqual({ label: 'Aug', net: 100000 })
  })

  it('ignores entries with null account_id', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries = [
      row({
        id: '1',
        account_id: 'a',
        amount: 20000,
        direction: 'out',
        occurred_at: '2026-08-15T00:00:00Z',
      }),
      row({
        id: '2',
        account_id: null,
        amount: 50000,
        direction: 'in',
        occurred_at: '2026-07-15T00:00:00Z',
      }),
    ]
    const periods = [
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const result = netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(result).toHaveLength(2)
    // Jul: only the 20000 out from Aug counts => rollback = -20000 => net = 120000
    expect(result[0]).toEqual({ label: 'Jul', net: 120000 })
    // Aug: net = 100000
    expect(result[1]).toEqual({ label: 'Aug', net: 100000 })
  })

  it('last period point equals currentNet', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries = [
      row({
        id: '1',
        account_id: 'a',
        amount: 20000,
        direction: 'out',
        occurred_at: '2026-08-15T00:00:00Z',
      }),
    ]
    const periods = [
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const result = netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(result[result.length - 1].net).toBe(currentNet)
  })

  it('empty entries => flat line at currentNet', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries: MoneyEntryRow[] = []
    const periods = [
      { from: '2026-06-01T00:00:00Z', to: '2026-06-30T23:59:59Z', label: 'Jun' },
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const result = netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(result).toHaveLength(3)
    expect(result.every(p => p.net === currentNet)).toBe(true)
  })

  it('ignores deleted entries', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries = [
      row({
        id: '1',
        account_id: 'a',
        amount: 20000,
        direction: 'out',
        occurred_at: '2026-08-15T00:00:00Z',
        deleted_at: '2026-08-20T00:00:00Z',
      }),
      row({
        id: '2',
        account_id: 'a',
        amount: 50000,
        direction: 'in',
        occurred_at: '2026-08-10T00:00:00Z',
        deleted_at: null,
      }),
    ]
    const periods = [
      { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z', label: 'Jul' },
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const result = netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(result).toHaveLength(2)
    // Jul: both entries occur in Aug (at or after Jul end), but the 20000 out is deleted, so only 50000 in counts => rollback = +50000 => net = 100000 - 50000 = 50000
    expect(result[0]).toEqual({ label: 'Jul', net: 50000 })
    // Aug: net = 100000
    expect(result[1]).toEqual({ label: 'Aug', net: 100000 })
  })

  it('does not mutate inputs', () => {
    const currentNet = 100000
    const activeAccountIds = new Set(['a'])
    const entries = [
      row({
        id: '1',
        account_id: 'a',
        amount: 20000,
        direction: 'out',
        occurred_at: '2026-08-15T00:00:00Z',
      }),
    ]
    const periods = [
      { from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z', label: 'Aug' },
    ]
    const toPrimary = (e: MoneyEntryRow) => e.amount

    const originalEntries = JSON.parse(JSON.stringify(entries))
    const originalPeriods = JSON.parse(JSON.stringify(periods))

    netWorthSeries(currentNet, entries, activeAccountIds, periods, toPrimary)

    expect(entries).toEqual(originalEntries)
    expect(periods).toEqual(originalPeriods)
  })
})
