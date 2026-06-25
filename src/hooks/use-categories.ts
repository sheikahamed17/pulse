'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CategoryRow } from '@/lib/dexie'

export function useCategories(userId: string | undefined, kind?: 'spend' | 'income'): CategoryRow[] {
  return useLiveQuery<CategoryRow[], CategoryRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.categories
        .where(kind ? '[user_id+kind]' : 'user_id')
        .equals(kind ? [userId, kind] : userId)
        .toArray()
      return all
        .filter(c => !c.deleted_at && !c.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order)
    },
    [userId, kind],
    [],
  ) ?? []
}
