import type { TaskRow } from '@/lib/dexie'
import type { TaskFilter } from '@/hooks/use-tasks'
import { filterTasks } from '@/lib/task-org'

export type TaskNode = TaskRow & { children: TaskRow[] }

/** Group flat tasks into top-level nodes with their sub-tasks. A task whose
 *  parent_id points to a missing task (orphan) is treated as top-level. Order preserved. */
export function groupTasks(tasks: TaskRow[]): TaskNode[] {
  const ids = new Set(tasks.map(t => t.id))
  const childrenOf = new Map<string, TaskRow[]>()
  const topLevel: TaskRow[] = []
  for (const t of tasks) {
    const pid = t.parent_id ?? null
    if (pid && ids.has(pid)) {
      const arr = childrenOf.get(pid) ?? []
      arr.push(t)
      childrenOf.set(pid, arr)
    } else {
      topLevel.push(t)
    }
  }
  return topLevel.map(t => ({ ...t, children: childrenOf.get(t.id) ?? [] }))
}

/** done/total sub-task counts, or null if the node has no children. */
export function subtaskProgress(node: TaskNode): { done: number; total: number } | null {
  if (node.children.length === 0) return null
  return { done: node.children.filter(c => !!c.completed_at).length, total: node.children.length }
}

/** The parent completion the current child-set implies (bottom-up auto-complete),
 *  or null if no change. `children` already reflects the just-applied toggle/delete. */
export function rollupOps(parent: TaskRow, children: TaskRow[], nowIso: string): { completed_at: string | null } | null {
  if (children.length === 0) return null
  const allDone = children.every(c => !!c.completed_at)
  if (allDone && !parent.completed_at) return { completed_at: nowIso }
  if (!allDone && parent.completed_at) return { completed_at: null }
  return null
}

/** Filter grouped nodes at the PARENT level (open/completed + project/tag). Children
 *  always render under a visible parent, so progress counts stay whole. */
export function visibleNodes(nodes: TaskNode[], filter: TaskFilter, projectId: string | null, tag: string | null): TaskNode[] {
  return nodes.filter(n => {
    if (filter === 'open' && n.completed_at) return false
    if (filter === 'completed' && !n.completed_at) return false
    return filterTasks([n], { projectId, tag }).length > 0   // reuse the tags/projects predicate
  })
}
