'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type NoteRow } from '@/lib/dexie'

export function useNotes(userId: string | undefined): NoteRow[] {
  return useLiveQuery<NoteRow[], NoteRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.note_entries.where('user_id').equals(userId).toArray()
      const live = all.filter(e => !e.deleted_at)
      return [...live].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    },
    [userId],
    [],
  ) ?? []
}
