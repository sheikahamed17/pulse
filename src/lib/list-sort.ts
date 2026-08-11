import type { LearningRow, TaskRow } from '@/lib/dexie'

export type DateSort = 'newest' | 'oldest'
export type TaskSort = 'due' | 'created-desc' | 'created-asc' | 'priority'

/** Sort rows by occurred_at. Newest first or oldest first. Pure: copies and sorts. */
export function sortByDate<T extends { occurred_at: string }>(rows: T[], dir: DateSort): T[] {
  const copy = [...rows]
  if (dir === 'newest') {
    return copy.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  } else {
    return copy.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  }
}

/** Sort tasks by the specified sort mode. Pure: copies and sorts.
 *  - 'due': due_at ascending (nulls last)
 *  - 'created-desc': created_at descending (newest first)
 *  - 'created-asc': created_at ascending (oldest first)
 *  - 'priority': priority (high→medium→low) then due_at ascending (nulls last)
 */
export function sortTasks(tasks: TaskRow[], sort: TaskSort): TaskRow[] {
  const copy = [...tasks]

  if (sort === 'due') {
    return copy.sort((a, b) => {
      // Both null → stable order (0)
      if (a.due_at === null && b.due_at === null) return 0
      // a null, b not → a after b
      if (a.due_at === null) return 1
      // b null, a not → b after a
      if (b.due_at === null) return -1
      // Both present → ascending
      return a.due_at.localeCompare(b.due_at)
    })
  }

  if (sort === 'created-desc') {
    return copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  if (sort === 'created-asc') {
    return copy.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  if (sort === 'priority') {
    const priorityRank = { high: 0, medium: 1, low: 2 }
    return copy.sort((a, b) => {
      const rankDiff = priorityRank[a.priority] - priorityRank[b.priority]
      if (rankDiff !== 0) return rankDiff
      // Same priority → sort by due_at (nulls last)
      if (a.due_at === null && b.due_at === null) return 0
      if (a.due_at === null) return 1
      if (b.due_at === null) return -1
      return a.due_at.localeCompare(b.due_at)
    })
  }

  return copy
}
