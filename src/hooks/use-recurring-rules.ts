'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type RecurringRuleRow } from '@/lib/dexie'

export function useRecurringRules(userId: string | undefined): RecurringRuleRow[] {
  return useLiveQuery<RecurringRuleRow[], RecurringRuleRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.recurring_rules.where('user_id').equals(userId).toArray()
      return all
        .filter(r => !r.deleted_at)
        .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at))
    },
    [userId],
    [],
  ) ?? []
}
