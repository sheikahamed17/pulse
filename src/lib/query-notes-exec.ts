import type { NoteRow } from '@/lib/dexie'
import type { QueryNotesPlan } from '@/lib/query-plans'
import { searchNotes } from '@/lib/search-notes'

function sortNotes(notes: NoteRow[]): NoteRow[] {
  return [...notes].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
}

export function filterNotesForQuery(
  notes: NoteRow[],
  plan: QueryNotesPlan,
): NoteRow[] {
  // Exclude tombstones
  let live = notes.filter(n => !n.deleted_at)

  // Apply search filter (reuse searchNotes)
  live = searchNotes(live, plan.search ?? '')

  // Apply tag filter (any of the specified tags)
  if (plan.tags.length > 0) {
    live = live.filter(n =>
      plan.tags.some(tag => n.tags.includes(tag))
    )
  }

  // Apply period filter if present
  if (plan.period) {
    live = live.filter(n =>
      n.occurred_at >= plan.period!.from && n.occurred_at < plan.period!.to
    )
  }

  // Sort results by occurred_at descending
  return sortNotes(live)
}
