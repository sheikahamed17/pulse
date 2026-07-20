import type { TaskRow } from '@/lib/dexie'
import type { QueryTaskPlan } from '@/lib/query-plans'

function sortTasks(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    // Completed-first if both completed
    if (a.completed_at && b.completed_at) return b.completed_at.localeCompare(a.completed_at)
    // Completed sinks below open
    if (a.completed_at && !b.completed_at) return 1
    if (!a.completed_at && b.completed_at) return -1
    // Both open: due_at ASC, nulls last
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at)
    if (a.due_at && !b.due_at) return -1
    if (!a.due_at && b.due_at) return 1
    // Both null: fallback to created_at
    return a.created_at.localeCompare(b.created_at)
  })
}

export function filterTasksForQuery(
  tasks: TaskRow[],
  plan: QueryTaskPlan,
  nowIso: string,
): TaskRow[] {
  // Exclude tombstones
  let live = tasks.filter(t => !t.deleted_at)

  // Apply status filter
  if (plan.status === 'open') {
    live = live.filter(t => !t.completed_at)
  } else if (plan.status === 'overdue') {
    live = live.filter(t => !t.completed_at && t.due_at && t.due_at < nowIso)
  } else if (plan.status === 'done') {
    live = live.filter(t => !!t.completed_at)
  } else if (plan.status === 'all') {
    // Already filtered to live (non-deleted)
  }

  // Apply period filter if present
  if (plan.period) {
    live = live.filter(t => {
      // For done/completed tasks, use completed_at; for others use due_at if present, else created_at
      const dateToCheck = t.completed_at
        ? t.completed_at
        : (t.due_at || t.created_at)

      return dateToCheck >= plan.period!.from && dateToCheck < plan.period!.to
    })
  }

  // Sort results using the same logic as use-tasks
  return sortTasks(live)
}
