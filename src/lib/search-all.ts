import type { Tab } from '@/hooks/use-tab-state'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow, CategoryRow } from '@/lib/dexie'
import { currencySymbol } from '@/lib/currency'

export type SearchResult = { kind: Tab; id: string; label: string; snippet: string }
export type SearchGroup = { kind: Tab; heading: string; items: SearchResult[]; truncated: boolean }

const CAP = 25

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function moneySnippet(e: MoneyEntryRow): string {
  const major = e.currency === 'JPY' ? e.amount : e.amount / 100
  return `${currencySymbol(e.currency)}${major.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function group(kind: Tab, heading: string, items: SearchResult[]): SearchGroup | null {
  if (items.length === 0) return null
  return { kind, heading, items: items.slice(0, CAP), truncated: items.length > CAP }
}

export function searchAll(
  query: string,
  data: {
    money: MoneyEntryRow[]
    tasks: TaskRow[]
    learnings: LearningRow[]
    notes: NoteRow[]
    categoryById: Map<string, CategoryRow>
  },
): SearchGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(q)
  const hasTag = (tags: string[] | null | undefined) => (tags ?? []).some(t => t.toLowerCase().includes(q))

  const money: SearchResult[] = data.money
    .filter(e => !e.deleted_at)
    .filter(e => has(e.description) || has(e.category_id ? data.categoryById.get(e.category_id)?.name : undefined))
    .map(e => {
      const catName = e.category_id ? data.categoryById.get(e.category_id)?.name : undefined
      return { kind: 'money' as const, id: e.id, label: e.description || catName || 'Uncategorized', snippet: moneySnippet(e) }
    })

  const tasks: SearchResult[] = data.tasks
    .filter(t => !t.deleted_at)
    .filter(t => has(t.title) || hasTag(t.tags))
    .map(t => ({ kind: 'tasks' as const, id: t.id, label: t.title, snippet: '' }))

  const learnings: SearchResult[] = data.learnings
    .filter(l => !l.deleted_at)
    .filter(l => has(l.text) || hasTag(l.tags) || has(l.attribution))
    .map(l => ({ kind: 'learning' as const, id: l.id, label: truncate(l.text, 80), snippet: l.attribution ?? '' }))

  const notes: SearchResult[] = data.notes
    .filter(n => !n.deleted_at)
    .filter(n => has(n.title) || has(n.body) || hasTag(n.tags))
    .map(n => ({ kind: 'notes' as const, id: n.id, label: n.title || truncate(n.body, 80), snippet: n.title ? truncate(n.body, 80) : '' }))

  return [
    group('money', 'Money', money),
    group('tasks', 'Tasks', tasks),
    group('learning', 'Learn', learnings),
    group('notes', 'Notes', notes),
  ].filter((g): g is SearchGroup => g !== null)
}
