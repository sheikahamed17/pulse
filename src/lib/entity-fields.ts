export const MONEY_FIELDS = [
  'amount', 'currency', 'direction', 'category_id', 'description',
  'occurred_at', 'source', 'receipt_key', 'raw_input', 'recurring_rule_id',
] as const

export const RECURRING_FIELDS = [
  'amount', 'currency', 'direction', 'category_id', 'description',
  'period', 'interval_count', 'anchor_at', 'next_due_at',
  'end_condition_kind', 'end_until', 'end_count',
  'occurrences_so_far', 'is_active',
] as const

export const CATEGORY_FIELDS = [
  'name', 'kind', 'icon', 'color', 'sort_order', 'is_archived',
] as const

export const TASK_FIELDS = [
  'title', 'due_at', 'priority', 'completed_at',
  'source', 'raw_input',
] as const

export const LEARNING_FIELDS = [
  'text', 'tags', 'attribution', 'source', 'occurred_at',
] as const

export const INSIGHT_FIELDS = [
  'period', 'starts_at', 'ends_at', 'summary', 'metrics',
] as const
