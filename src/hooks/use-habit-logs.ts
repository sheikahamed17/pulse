'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type HabitLogRow } from '@/lib/dexie'

export function useHabitLogs(userId: string | undefined): HabitLogRow[] {
  return useLiveQuery<HabitLogRow[], HabitLogRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.habit_logs
        .where('user_id')
        .equals(userId)
        .toArray()
      return all.filter(l => !l.deleted_at)
    },
    [userId],
    [],
  ) ?? []
}
