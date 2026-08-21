import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'

export type ActivityItem = {
  kind: 'money' | 'task' | 'learning' | 'note'
  id: string
  label: string
  at: string
}

export function recentActivity(
  data: {
    money: MoneyEntryRow[]
    tasks: TaskRow[]
    learnings: LearningRow[]
    notes: NoteRow[]
  },
  limit: number,
): ActivityItem[] {
  const items: ActivityItem[] = []

  // Money entries
  if (data.money && Array.isArray(data.money)) {
    for (const e of data.money) {
      if (!e.deleted_at) {
        items.push({
          kind: 'money',
          id: e.id,
          label: e.description || '(no description)',
          at: e.occurred_at,
        })
      }
    }
  }

  // Tasks
  if (data.tasks && Array.isArray(data.tasks)) {
    for (const t of data.tasks) {
      if (!t.deleted_at) {
        items.push({
          kind: 'task',
          id: t.id,
          label: t.title || '(no title)',
          at: t.created_at,
        })
      }
    }
  }

  // Learnings
  if (data.learnings && Array.isArray(data.learnings)) {
    for (const l of data.learnings) {
      if (!l.deleted_at) {
        items.push({
          kind: 'learning',
          id: l.id,
          label: l.text || '(no text)',
          at: l.occurred_at,
        })
      }
    }
  }

  // Notes
  if (data.notes && Array.isArray(data.notes)) {
    for (const n of data.notes) {
      if (!n.deleted_at) {
        items.push({
          kind: 'note',
          id: n.id,
          label: n.title || n.body?.slice(0, 50) || '(no title)',
          at: n.occurred_at,
        })
      }
    }
  }

  // Sort by `at` descending (most recent first)
  items.sort((a, b) => b.at.localeCompare(a.at))

  // Take limit
  return items.slice(0, limit)
}
