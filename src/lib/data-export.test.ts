import { describe, it, expect } from 'vitest'
import { buildBackup, parseBackup, moneyEntriesToCsv } from './data-export'
import type { Op } from '@/types/ops'
import type { MoneyEntryRow } from './dexie'

describe('buildBackup', () => {
  it('creates a backup with correct shape and op_count', () => {
    const ops: Op[] = [
      {
        id: '1',
        hlc: '0000000000000001-000001-device1',
        device_id: 'device1',
        user_id: 'user1',
        entity_kind: 'money',
        entity_id: 'money1',
        op_type: 'create',
        payload: { amount: 1000, currency: 'USD' },
        schema_version: 1,
      },
      {
        id: '2',
        hlc: '0000000000000002-000001-device1',
        device_id: 'device1',
        user_id: 'user1',
        entity_kind: 'money',
        entity_id: 'money2',
        op_type: 'create',
        payload: { amount: 2000, currency: 'USD' },
        schema_version: 1,
      },
    ]
    const exportedAt = '2026-08-24T10:00:00Z'

    const backup = buildBackup(ops, exportedAt)

    expect(backup.app).toBe('pulse')
    expect(backup.version).toBe(1)
    expect(backup.exported_at).toBe(exportedAt)
    expect(backup.op_count).toBe(2)
    expect(backup.ops).toEqual(ops)
  })

  it('handles empty ops array', () => {
    const backup = buildBackup([], '2026-08-24T10:00:00Z')

    expect(backup.op_count).toBe(0)
    expect(backup.ops).toEqual([])
  })
})

describe('parseBackup', () => {
  it('round-trips through JSON correctly', () => {
    const ops: Op[] = [
      {
        id: '1',
        hlc: '0000000000000001-000001-device1',
        device_id: 'device1',
        user_id: 'user1',
        entity_kind: 'money',
        entity_id: 'money1',
        op_type: 'create',
        payload: { amount: 1000, currency: 'USD' },
        schema_version: 1,
      },
    ]
    const backup = buildBackup(ops, '2026-08-24T10:00:00Z')
    const json = JSON.stringify(backup)

    const result = parseBackup(json)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ops).toEqual(ops)
    }
  })

  it('rejects invalid JSON', () => {
    const result = parseBackup('not json')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Not valid JSON')
    }
  })

  it('rejects missing app field', () => {
    const backup = {
      version: 1,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 0,
      ops: [],
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("app")
    }
  })

  it('rejects missing version field', () => {
    const backup = {
      app: 'pulse',
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 0,
      ops: [],
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("version")
    }
  })

  it('rejects missing ops field', () => {
    const backup = {
      app: 'pulse',
      version: 1,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 0,
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("ops")
    }
  })

  it('rejects invalid app value', () => {
    const backup = {
      app: 'other',
      version: 1,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 0,
      ops: [],
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("app")
    }
  })

  it('rejects invalid version value', () => {
    const backup = {
      app: 'pulse',
      version: 2,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 0,
      ops: [],
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("version")
    }
  })

  it('rejects when ops is not an array', () => {
    const backup = {
      app: 'pulse',
      version: 1,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 0,
      ops: { some: 'object' },
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("ops")
    }
  })

  it('rejects a backup with an op missing a required field', () => {
    const backup = {
      app: 'pulse',
      version: 1,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 1,
      ops: [
        {
          id: '1',
          hlc: '0000000000000001-000001-device1',
          device_id: 'device1',
          user_id: 'user1',
          entity_kind: 'money',
          entity_id: 'money1',
          op_type: 'create',
          payload: { amount: 1000, currency: 'USD' },
          // missing schema_version
        },
      ],
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('invalid')
      expect(result.error).toContain('1')
      expect(result.error).toContain('1')
    }
  })

  it('rejects a backup with multiple invalid ops', () => {
    const backup = {
      app: 'pulse',
      version: 1,
      exported_at: '2026-08-24T10:00:00Z',
      op_count: 3,
      ops: [
        {
          id: '1',
          hlc: '0000000000000001-000001-device1',
          device_id: 'device1',
          user_id: 'user1',
          entity_kind: 'money',
          entity_id: 'money1',
          op_type: 'create',
          payload: { amount: 1000, currency: 'USD' },
          schema_version: 1,
        },
        {
          id: '2',
          hlc: '0000000000000002-000001-device1',
          device_id: 'device1',
          user_id: 'user1',
          entity_kind: 'money',
          entity_id: 'money2',
          op_type: 'create',
          payload: { amount: 2000, currency: 'USD' },
          // missing schema_version
        },
        {
          id: '3',
          hlc: '0000000000000003-000001-device1',
          device_id: 'device1',
          user_id: 'user1',
          entity_kind: 'money',
          entity_id: 'money3',
          op_type: 'create',
          payload: { amount: 3000, currency: 'USD' },
          // missing schema_version
        },
      ],
    }
    const result = parseBackup(JSON.stringify(backup))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('2 of 3')
    }
  })
})

describe('moneyEntriesToCsv', () => {
  it('generates CSV with correct header', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 150000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat1',
        description: 'Groceries',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Store A',
        tags: ['food'],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)
    const lines = csv.split('\n')

    expect(lines[0]).toBe('date,direction,amount,currency,category_id,merchant,description,tags,account_id')
  })

  it('converts INR amount from minor to major units with 2 decimals', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 150000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat1',
        description: 'Groceries',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Store A',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)
    const lines = csv.split('\n')

    expect(lines[1]).toContain('1500.00')
  })

  it('converts JPY amount as integer (no decimal)', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 5000,
        currency: 'JPY',
        direction: 'out',
        category_id: 'cat1',
        description: 'Meal',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Restaurant',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)
    const lines = csv.split('\n')

    expect(lines[1]).toContain(',5000,')
  })

  it('escapes fields containing commas', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 10000,
        currency: 'USD',
        direction: 'out',
        category_id: 'cat1',
        description: 'Apples, Oranges, Bananas',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Market',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)

    expect(csv).toContain('"Apples, Oranges, Bananas"')
  })

  it('escapes fields containing quotes', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 10000,
        currency: 'USD',
        direction: 'out',
        category_id: 'cat1',
        description: 'He said "hello"',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Store',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)

    expect(csv).toContain('"He said ""hello"""')
  })

  it('escapes fields containing newlines', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 10000,
        currency: 'USD',
        direction: 'out',
        category_id: 'cat1',
        description: 'Line 1\nLine 2',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Store',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)

    expect(csv).toContain('"Line 1\nLine 2"')
  })

  it('joins tags with semicolon and space', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 10000,
        currency: 'USD',
        direction: 'out',
        category_id: 'cat1',
        description: 'Groceries',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'Store',
        tags: ['food', 'groceries', 'weekly'],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)

    expect(csv).toContain('food; groceries; weekly')
  })

  it('handles null fields as empty strings', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 10000,
        currency: 'USD',
        direction: 'out',
        category_id: null,
        description: null,
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: null,
        tags: [],
        account_id: null,
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)
    const lines = csv.split('\n')
    const cells = lines[1].split(',')

    // Should have 9 cells (header has 9 columns): date, direction, amount, currency, category_id, merchant, description, tags, account_id
    expect(cells.length).toBeGreaterThanOrEqual(9)
  })

  it('maintains order of input rows', () => {
    const rows: MoneyEntryRow[] = [
      {
        id: '1',
        user_id: 'user1',
        amount: 10000,
        currency: 'USD',
        direction: 'out',
        category_id: 'cat1',
        description: 'First',
        occurred_at: '2026-08-24',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'A',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
      {
        id: '2',
        user_id: 'user1',
        amount: 20000,
        currency: 'USD',
        direction: 'in',
        category_id: 'cat2',
        description: 'Second',
        occurred_at: '2026-08-25',
        source: 'manual',
        receipt_key: null,
        raw_input: null,
        recurring_rule_id: null,
        merchant: 'B',
        tags: [],
        account_id: 'acc1',
        field_hlcs: {},
        deleted_at: null,
        created_at: '2026-08-25T10:00:00Z',
        updated_at: '2026-08-25T10:00:00Z',
      },
    ]

    const csv = moneyEntriesToCsv(rows)
    const lines = csv.split('\n')

    expect(lines[1]).toContain('First')
    expect(lines[2]).toContain('Second')
  })
})
