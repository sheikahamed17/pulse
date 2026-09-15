'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type JournalRow } from '@/lib/dexie'

/** Journal entries for a user, newest first (non-deleted). */
export function useJournal(userId: string | undefined): JournalRow[] {
  return useLiveQuery<JournalRow[], JournalRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.journal_entries.where('user_id').equals(userId).toArray()
      return all
        .filter(j => !j.deleted_at)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    },
    [userId],
    [],
  ) ?? []
}
