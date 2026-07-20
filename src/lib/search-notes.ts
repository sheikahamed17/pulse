import type { NoteRow } from '@/lib/dexie'

export function searchNotes(notes: NoteRow[], query: string): NoteRow[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return notes
  return notes.filter(note => {
    const titleMatch = note.title?.toLowerCase().includes(trimmed) ?? false
    const bodyMatch = note.body.toLowerCase().includes(trimmed)
    return titleMatch || bodyMatch
  })
}
