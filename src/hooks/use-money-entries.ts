'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MoneyEntryRow } from '@/lib/dexie'

export type PeriodRange = { from: string; to: string }     // ISO timestamps

export function useMoneyEntries(userId: string | undefined, range?: PeriodRange): MoneyEntryRow[] {
  return useLiveQuery<MoneyEntryRow[], MoneyEntryRow[]>(
    async () => {
      if (!userId) return []
      let q
      if (range) {
        q = db.money_entries
          .where('[user_id+occurred_at]')
          .between([userId, range.from], [userId, range.to])
      } else {
        q = db.money_entries.where('user_id').equals(userId)
      }
      const all = await q.toArray()
      return all
        .filter(e => !e.deleted_at)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    },
    [userId, range?.from, range?.to],
    [],
  ) ?? []
}
