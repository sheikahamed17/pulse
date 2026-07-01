'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TaskRow } from '@/lib/dexie'

export type TaskFilter = 'open' | 'completed' | 'all'

export function useTasks(userId: string | undefined, filter: TaskFilter = 'open'): TaskRow[] {
  return useLiveQuery<TaskRow[], TaskRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.tasks.where('user_id').equals(userId).toArray()
      const live = all.filter(t => !t.deleted_at)
      if (filter === 'open')      return sortTasks(live.filter(t => !t.completed_at))
      if (filter === 'completed') return sortTasks(live.filter(t =>  t.completed_at))
      return sortTasks(live)
    },
    [userId, filter],
    [],
  ) ?? []
}

// Open tasks: by due_at ASC (overdue first), null due_at last.
// Completed tasks: by completed_at DESC (most-recent first).
function sortTasks(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    // Completed-first if both completed
    if (a.completed_at && b.completed_at) return b.completed_at.localeCompare(a.completed_at)
    // Completed sinks below open
    if (a.completed_at && !b.completed_at) return  1
    if (!a.completed_at && b.completed_at) return -1
    // Both open: due_at ASC, nulls last
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at)
    if (a.due_at && !b.due_at) return -1
    if (!a.due_at && b.due_at) return  1
    // Both null: fallback to created_at
    return a.created_at.localeCompare(b.created_at)
  })
}
