'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type InsightRow } from '@/lib/dexie'

export function useInsights(userId: string | undefined): InsightRow[] {
  return useLiveQuery<InsightRow[], InsightRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.insights.where('user_id').equals(userId).toArray()
      return all.filter(i => !i.deleted_at).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    },
    [userId],
    [],
  ) ?? []
}
