'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TransferRow } from '@/lib/dexie'

export function useTransfers(userId: string | undefined): TransferRow[] {
  return useLiveQuery<TransferRow[], TransferRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.transfers
        .where('user_id')
        .equals(userId)
        .toArray()
      return all
        .filter(t => !t.deleted_at)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    },
    [userId],
    [],
  ) ?? []
}
