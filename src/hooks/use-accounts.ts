'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AccountRow } from '@/lib/dexie'

export function useAccounts(userId: string | undefined): AccountRow[] {
  return useLiveQuery<AccountRow[], AccountRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.accounts
        .where('user_id')
        .equals(userId)
        .toArray()
      return all
        .filter(a => !a.deleted_at && !a.is_archived)
        .sort((a, b) => {
          const typeOrder = a.type.localeCompare(b.type)
          return typeOrder !== 0 ? typeOrder : a.name.localeCompare(b.name)
        })
    },
    [userId],
    [],
  ) ?? []
}
