'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LearningRow } from '@/lib/dexie'

export function useLearnings(userId: string | undefined): LearningRow[] {
  return useLiveQuery<LearningRow[], LearningRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.learning_entries.where('user_id').equals(userId).toArray()
      const live = all.filter(e => !e.deleted_at)
      return [...live].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    },
    [userId],
    [],
  ) ?? []
}
