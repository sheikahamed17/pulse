'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type WidgetRow } from '@/lib/dexie'

export function useWidgets(userId: string | undefined): WidgetRow[] {
  return useLiveQuery<WidgetRow[], WidgetRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.widgets
        .where('user_id')
        .equals(userId)
        .toArray()
      return all
        .filter(w => !w.deleted_at)
        .sort((a, b) => {
          const orderDiff = a.sort_order - b.sort_order
          if (orderDiff !== 0) return orderDiff
          return (a.type ?? '').localeCompare(b.type ?? '')
        })
    },
    [userId],
    [],
  ) ?? []
}
