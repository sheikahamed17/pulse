'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type GoalRow } from '@/lib/dexie'

export function useGoals(userId: string | undefined): GoalRow[] {
  return useLiveQuery<GoalRow[], GoalRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.goals
        .where('user_id')
        .equals(userId)
        .toArray()
      return all
        .filter(g => !g.deleted_at && !g.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    [userId],
    [],
  ) ?? []
}
