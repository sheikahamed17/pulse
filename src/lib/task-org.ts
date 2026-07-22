import type { TaskRow } from '@/lib/dexie'

/** Add a trimmed tag if non-empty and not already present. */
export function addTag(tags: string[], raw: string): string[] {
  const t = raw.trim()
  if (!t || tags.includes(t)) return tags
  return [...tags, t]
}

/** Filter tasks by an optional project id AND an optional tag (null = no constraint). */
export function filterTasks(tasks: TaskRow[], f: { projectId: string | null; tag: string | null }): TaskRow[] {
  return tasks.filter(t =>
    (f.projectId == null || t.project_id === f.projectId) &&
    // ?? [] guards legacy tasks materialized before tags existed (Dexie row has no tags field)
    (f.tag == null || (t.tags ?? []).includes(f.tag)),
  )
}
