'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ProjectRow } from '@/lib/dexie'

/** Live projects for a user. `includeArchived` false (default) hides archived (for pickers). */
export function useProjects(userId: string | undefined, includeArchived = false): ProjectRow[] {
  return useLiveQuery<ProjectRow[], ProjectRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.projects.where('user_id').equals(userId).toArray()
      return all
        .filter(p => !p.deleted_at && (includeArchived || p.archived !== 1))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    [userId, includeArchived],
    [],
  ) ?? []
}
