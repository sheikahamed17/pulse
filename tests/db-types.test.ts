import { describe, it, expect, expectTypeOf } from 'vitest'
import type { DB, OpLogTable, WidgetTable, MoneyEntryTable, RecurringRuleTable, CategoryTable, TaskTable, FxRateTable, UserPrefsTable, InsightTable, PushSubscriptionTable, PushNotificationTable } from '@/lib/db'

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
    expectTypeOf<MoneyEntryTable>().toHaveProperty('source').toEqualTypeOf<'voice' | 'manual' | 'recurring' | 'receipt'>()
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

describe('Phase 2 DB types', () => {
  it('DB includes tasks / fx_rates / user_prefs', () => {
    expectTypeOf<DB>().toHaveProperty('tasks')
    expectTypeOf<DB>().toHaveProperty('fx_rates')
    expectTypeOf<DB>().toHaveProperty('user_prefs')
  })

  it('TaskTable has required fields', () => {
    expectTypeOf<TaskTable>().toHaveProperty('title').toEqualTypeOf<string>()
    expectTypeOf<TaskTable>().toHaveProperty('due_at').toEqualTypeOf<string | null>()
    expectTypeOf<TaskTable>().toHaveProperty('priority').toEqualTypeOf<'low' | 'medium' | 'high'>()
    expectTypeOf<TaskTable>().toHaveProperty('completed_at').toEqualTypeOf<string | null>()
    expectTypeOf<TaskTable>().toHaveProperty('source').toEqualTypeOf<'voice' | 'manual' | 'recurring'>()
    expectTypeOf<TaskTable>().toHaveProperty('field_hlcs').toEqualTypeOf<string>()
  })

  it('FxRateTable has the rate primary key shape', () => {
    expectTypeOf<FxRateTable>().toHaveProperty('date').toEqualTypeOf<string>()
    expectTypeOf<FxRateTable>().toHaveProperty('base').toEqualTypeOf<string>()
    expectTypeOf<FxRateTable>().toHaveProperty('target').toEqualTypeOf<string>()
    expectTypeOf<FxRateTable>().toHaveProperty('rate').toEqualTypeOf<number>()
  })

  it('UserPrefsTable has primary_currency + tz', () => {
    expectTypeOf<UserPrefsTable>().toHaveProperty('user_id').toEqualTypeOf<string>()
    expectTypeOf<UserPrefsTable>().toHaveProperty('primary_currency').toEqualTypeOf<string>()
    expectTypeOf<UserPrefsTable>().toHaveProperty('tz').toEqualTypeOf<string>()
  })
})

describe('Phase 3 DB types', () => {
  it('DB includes insights / push_subscriptions / push_notifications', () => {
    expectTypeOf<DB>().toHaveProperty('insights')
    expectTypeOf<DB>().toHaveProperty('push_subscriptions')
    expectTypeOf<DB>().toHaveProperty('push_notifications')
  })

  it('InsightTable has required fields', () => {
    expectTypeOf<InsightTable>().toHaveProperty('id').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('user_id').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('period').toEqualTypeOf<'weekly'>()
    expectTypeOf<InsightTable>().toHaveProperty('starts_at').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('ends_at').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('summary').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('metrics').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('field_hlcs').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('deleted_at').toEqualTypeOf<string | null>()
    expectTypeOf<InsightTable>().toHaveProperty('created_at').toEqualTypeOf<string>()
    expectTypeOf<InsightTable>().toHaveProperty('updated_at').toEqualTypeOf<string>()
  })

  it('PushSubscriptionTable has required fields', () => {
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('id').toEqualTypeOf<string>()
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('user_id').toEqualTypeOf<string>()
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('endpoint').toEqualTypeOf<string>()
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('p256dh').toEqualTypeOf<string>()
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('auth').toEqualTypeOf<string>()
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('failed_count').toEqualTypeOf<number>()
    expectTypeOf<PushSubscriptionTable>().toHaveProperty('created_at').toEqualTypeOf<string>()
  })

  it('PushNotificationTable has required fields', () => {
    expectTypeOf<PushNotificationTable>().toHaveProperty('id').toEqualTypeOf<string>()
    expectTypeOf<PushNotificationTable>().toHaveProperty('user_id').toEqualTypeOf<string>()
    expectTypeOf<PushNotificationTable>().toHaveProperty('title').toEqualTypeOf<string>()
    expectTypeOf<PushNotificationTable>().toHaveProperty('body').toEqualTypeOf<string>()
    expectTypeOf<PushNotificationTable>().toHaveProperty('url').toEqualTypeOf<string>()
    expectTypeOf<PushNotificationTable>().toHaveProperty('created_at').toEqualTypeOf<string>()
    expectTypeOf<PushNotificationTable>().toHaveProperty('read_at').toEqualTypeOf<string | null>()
  })

  it('MoneyEntryTable.source includes receipt', () => {
    expectTypeOf<MoneyEntryTable>().toHaveProperty('source').toEqualTypeOf<'voice' | 'manual' | 'recurring' | 'receipt'>()
  })

  it('MoneyEntryTable has receipt_key field', () => {
    expectTypeOf<MoneyEntryTable>().toHaveProperty('receipt_key').toEqualTypeOf<string | null>()
  })
})
