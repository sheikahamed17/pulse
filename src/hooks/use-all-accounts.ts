'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AccountRow } from '@/lib/dexie'

/** ALL accounts for the user — including archived and tombstoned — for DISPLAY
 *  name resolution only. Pickers must keep using `useAccounts` (active-only). */
export function useAllAccounts(userId: string | undefined): AccountRow[] {
  return useLiveQuery<AccountRow[], AccountRow[]>(
    async () => {
      if (!userId) return []
      return db.accounts.where('user_id').equals(userId).toArray()
    },
    [userId],
    [],
  ) ?? []
}
