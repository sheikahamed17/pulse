import { describe, it, expect, expectTypeOf } from 'vitest'
import type { DB, OpLogTable, WidgetTable, MoneyEntryTable, RecurringRuleTable, CategoryTable } from '@/lib/db'

// This file is mostly compile-time verification — the runtime tests below
// just exercise the type imports so vitest doesn't complain about an empty
// suite. Real D1-backed tests land in T17.

describe('db types', () => {
  it('OpLogTable has the expected shape', () => {
    const sample: OpLogTable = {
      id: 'op1',
      user_id: 'u1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1',
      entity_kind: 'widget',
      entity_id: 'w1',
      op_type: 'create',
      payload: '{}',
      schema_version: 1,
      applied_at: Date.now(),
    }
    expect(sample.entity_kind).toBe('widget')
  })

  it('WidgetTable has the expected shape', () => {
    const w: WidgetTable = {
      id: 'w1',
      user_id: 'u1',
      label: 'A',
      field_hlcs: '{}',
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(w.label).toBe('A')
  })
})

describe('Phase 1 DB types', () => {
  it('DB includes money_entries / recurring_rules / categories', () => {
    expectTypeOf<DB>().toHaveProperty('money_entries')
    expectTypeOf<DB>().toHaveProperty('recurring_rules')
    expectTypeOf<DB>().toHaveProperty('categories')
  })

  it('MoneyEntryTable has required fields', () => {
    expectTypeOf<MoneyEntryTable>().toHaveProperty('amount').toEqualTypeOf<number>()
    expectTypeOf<MoneyEntryTable>().toHaveProperty('direction').toEqualTypeOf<'out' | 'in'>()
    expectTypeOf<MoneyEntryTable>().toHaveProperty('source').toEqualTypeOf<'voice' | 'manual' | 'recurring'>()
    expectTypeOf<MoneyEntryTable>().toHaveProperty('field_hlcs').toEqualTypeOf<string>()
  })

  it('RecurringRuleTable has period + interval + end conditions', () => {
    expectTypeOf<RecurringRuleTable>().toHaveProperty('period').toEqualTypeOf<'daily' | 'weekly' | 'monthly' | 'yearly'>()
    expectTypeOf<RecurringRuleTable>().toHaveProperty('end_condition_kind').toEqualTypeOf<'never' | 'until' | 'count'>()
    expectTypeOf<RecurringRuleTable>().toHaveProperty('next_due_at').toEqualTypeOf<string>()
  })

  it('CategoryTable has spend/income kind', () => {
    expectTypeOf<CategoryTable>().toHaveProperty('kind').toEqualTypeOf<'spend' | 'income'>()
  })
})
