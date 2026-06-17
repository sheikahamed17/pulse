import Dexie, { type EntityTable } from 'dexie'
import type { Op } from '@/types/ops'

type SyncMeta = {
  key: string
  value: string
}

type VoiceQueueItem = {
  id: string
  blob: Blob
  created_at: string
  retry_count: number
  status: 'queued' | 'transcribing' | 'done' | 'failed'
}

export type WidgetRow = {
  id: string
  user_id: string
  label: string | null
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type CategoryRow = {
  id: string
  user_id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  color: string | null
  sort_order: number
  is_archived: number
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type RecurringRuleRow = {
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
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type MoneyEntryRow = {
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
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

class PulseDb extends Dexie {
  op_log!: EntityTable<Op, 'id'>
  widgets!: EntityTable<WidgetRow, 'id'>
  sync_meta!: EntityTable<SyncMeta, 'key'>
  voice_queue!: EntityTable<VoiceQueueItem, 'id'>
  categories!: EntityTable<CategoryRow, 'id'>
  recurring_rules!: EntityTable<RecurringRuleRow, 'id'>
  money_entries!: EntityTable<MoneyEntryRow, 'id'>

  constructor() {
    super('pulse')
    this.version(1).stores({
      op_log: 'id, hlc, entity_kind, entity_id',
      widgets: 'id, user_id, updated_at',
      sync_meta: 'key',
      voice_queue: 'id, status, created_at',
    })
    this.version(2).stores({
      categories:      'id, user_id, [user_id+kind], sort_order',
      recurring_rules: 'id, user_id, next_due_at, is_active',
      money_entries:   'id, user_id, occurred_at, [user_id+occurred_at], category_id, recurring_rule_id',
    })
  }
}

export const db = new PulseDb()

export async function resetDb() {
  await db.op_log.clear()
  await db.widgets.clear()
  await db.sync_meta.clear()
  await db.voice_queue.clear()
  await db.categories.clear()
  await db.recurring_rules.clear()
  await db.money_entries.clear()
}
