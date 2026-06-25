import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import type { D1Database } from '@cloudflare/workers-types'

// Database schema mirrors migrations/0001_initial.sql.
// Keep these types in sync when adding a migration.
export interface UserTable {
  id: string
  email: string
  name: string | null
  email_verified: number
  image: string | null
  created_at: number
  updated_at: number
}

export interface SessionTable {
  id: string
  user_id: string
  token: string
  expires_at: number
  ip_address: string | null
  user_agent: string | null
  created_at: number
  updated_at: number
}

export interface AccountTable {
  id: string
  user_id: string
  account_id: string
  provider_id: string
  access_token: string | null
  refresh_token: string | null
  id_token: string | null
  access_token_expires_at: number | null
  refresh_token_expires_at: number | null
  scope: string | null
  password: string | null
  created_at: number
  updated_at: number
}

export interface VerificationTable {
  id: string
  identifier: string
  value: string
  expires_at: number
  created_at: number
  updated_at: number
}

export interface DeviceTable {
  id: string
  user_id: string
  device_id: string
  name: string | null
  last_sync_hlc: string | null
  created_at: number
}

export interface OpLogTable {
  id: string
  user_id: string
  hlc: string
  device_id: string
  entity_kind: string
  entity_id: string
  op_type: 'create' | 'update' | 'delete'
  payload: string                // JSON-encoded
  schema_version: number
  applied_at: number
}

export interface WidgetTable {
  id: string
  user_id: string
  label: string | null
  field_hlcs: string             // JSON-encoded
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CategoryTable {
  id: string
  user_id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  color: string | null
  sort_order: number
  is_archived: number
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface RecurringRuleTable {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  anchor_at: string
  next_due_at: string
  end_condition_kind: 'never' | 'until' | 'count'
  end_until: string | null
  end_count: number | null
  occurrences_so_far: number
  is_active: number
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface MoneyEntryTable {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  occurred_at: string
  source: 'voice' | 'manual' | 'recurring'
  raw_input: string | null
  recurring_rule_id: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DB {
  user: UserTable
  session: SessionTable
  account: AccountTable
  verification: VerificationTable
  devices: DeviceTable
  op_log: OpLogTable
  widgets: WidgetTable
  categories: CategoryTable
  recurring_rules: RecurringRuleTable
  money_entries: MoneyEntryTable
}

export function createDb(d1: D1Database): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new D1Dialect({ database: d1 }),
  })
}
