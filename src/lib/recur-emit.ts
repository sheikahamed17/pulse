import { serverHlcFor } from '@/lib/server-hlc'
import type { Op } from '@/types/ops'

export type RecurTemplate = {
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  from_account_id?: string | null
  to_account_id?: string | null
}

/**
 * The op a recurring rule emits for a given due date: a TRANSFER when the rule
 * carries BOTH account ids (direction is ignored), otherwise a money entry.
 * Pure + deterministic (hlc derives from the due date). The op id is stable per
 * rule+due so the cron dedups re-runs.
 */
export function buildRecurOp(tpl: RecurTemplate, ruleId: string, nextDue: string, userId: string): Op {
  const base = {
    id: `recur-${ruleId}-${nextDue}`,
    hlc: serverHlcFor(nextDue),
    device_id: 'cron',
    user_id: userId,
    op_type: 'create' as const,
    schema_version: 1,
  }

  if (tpl.from_account_id && tpl.to_account_id) {
    return {
      ...base,
      entity_kind: 'transfer',
      entity_id: `recur-transfer-${ruleId}-${nextDue}`,
      payload: {
        from_account_id: tpl.from_account_id,
        to_account_id: tpl.to_account_id,
        amount: tpl.amount,
        currency: tpl.currency,
        occurred_at: nextDue,
        note: tpl.description ?? null,
      },
    }
  }

  return {
    ...base,
    entity_kind: 'money',
    entity_id: `recur-entry-${ruleId}-${nextDue}`,
    payload: {
      amount: tpl.amount,
      currency: tpl.currency,
      direction: tpl.direction,
      category_id: tpl.category_id,
      description: tpl.description,
      occurred_at: nextDue,
      source: 'recurring',
      recurring_rule_id: ruleId,
    },
  }
}
