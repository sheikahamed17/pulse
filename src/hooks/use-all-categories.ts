'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CategoryRow } from '@/lib/dexie'

/** ALL categories for the user — including archived and tombstoned — for DISPLAY
 *  name resolution only. Pickers must keep using `useCategories` (active-only). */
export function useAllCategories(userId: string | undefined): CategoryRow[] {
  return useLiveQuery<CategoryRow[], CategoryRow[]>(
    async () => {
      if (!userId) return []
      return db.categories.where('user_id').equals(userId).toArray()
    },
    [userId],
    [],
  ) ?? []
}
