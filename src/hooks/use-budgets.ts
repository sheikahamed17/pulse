'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BudgetRow } from '@/lib/dexie'

export function useBudgets(userId: string | undefined): BudgetRow[] {
  return useLiveQuery<BudgetRow[], BudgetRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.budgets.where('user_id').equals(userId).toArray()
      return all.filter(b => !b.deleted_at)
    },
    [userId],
    [],
  ) ?? []
}
