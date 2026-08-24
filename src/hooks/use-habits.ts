'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type HabitRow } from '@/lib/dexie'

export function useHabits(userId: string | undefined): HabitRow[] {
  return useLiveQuery<HabitRow[], HabitRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.habits
        .where('user_id')
        .equals(userId)
        .toArray()
      return all
        .filter(h => !h.deleted_at && !h.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    [userId],
    [],
  ) ?? []
}

export function useArchivedHabits(userId: string | undefined): HabitRow[] {
  return useLiveQuery<HabitRow[], HabitRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.habits
        .where('user_id')
        .equals(userId)
        .toArray()
      return all
        .filter(h => h.is_archived === 1 && !h.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    [userId],
    [],
  ) ?? []
}
