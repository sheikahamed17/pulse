'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type GoalRow } from '@/lib/dexie'

/** ALL goals for the user — including archived and tombstoned — for DISPLAY
 *  name resolution only. */
export function useAllGoals(userId: string | undefined): GoalRow[] {
  return useLiveQuery<GoalRow[], GoalRow[]>(
    async () => {
      if (!userId) return []
      return db.goals.where('user_id').equals(userId).toArray()
    },
    [userId],
    [],
  ) ?? []
}
