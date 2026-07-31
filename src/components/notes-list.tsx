'use client'

import { useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useNotes } from '@/hooks/use-notes'
import { SwipeRow } from '@/components/swipe-row'
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { searchNotes } from '@/lib/search-notes'
import { formatLocalDateTime } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import type { NoteRow } from '@/lib/dexie'
import { cn } from '@/lib/utils'

type Props = { userId: string; selectedTag: string | null; searchQuery?: string; onEdit?: (row: NoteRow) => void }

function truncatePreview(text: string, maxChars: number = 100): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…'
}

export function NotesList({ userId, selectedTag, searchQuery = '', onEdit }: Props) {
  const notes = useNotes(userId)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const undo = useUndo()

  const searched = searchNotes(notes, searchQuery)
  const filtered = selectedTag
    ? searched.filter(e => e.tags.includes(selectedTag))
    : searched

  async function deleteNote(e: NoteRow) {
    const op = await generateOp({
      entity_kind: 'note', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push('Deleted note', async () => {
      const undoOp = await generateOp({
        entity_kind: 'note', entity_id: e.id,
        op_type: 'update', payload: resurrectPayload('note', e),
        user_id: userId,
      })
      await applyLocalOp(undoOp)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  if (filtered.length === 0) {
    return (
      <div className="glass-soft rounded-2xl p-4 text-center text-sm text-muted-foreground">
        {selectedTag ? `No notes with tag "${selectedTag}".` : "No notes yet — say 'note that…'"}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {filtered.map(e => (
        <li key={e.id} id={`pulse-row-${e.id}`} className="relative">
          <SwipeRow
            isOpen={openId === e.id}
            onOpenChange={o => setOpenId(o ? e.id : null)}
            onLongPress={() => setMenuFor(e.id)}
            onDelete={() => deleteNote(e)}
            deleteLabel={`Delete note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
            className="glass-soft rounded-2xl flex flex-col gap-2 p-3"
          >
            <p className="text-sm md:text-base font-medium">{e.title || truncatePreview(e.body)}</p>
            {e.title && (
              <p className="text-xs text-muted-foreground line-clamp-2">{truncatePreview(e.body, 150)}</p>
            )}
            {e.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {e.tags.map(tag => (
                  <span
                    key={tag}
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      selectedTag === tag
                        ? 'bg-accent-2/30 text-accent-2 border border-accent-2/50'
                        : 'bg-white/10 text-muted-foreground border border-white/20',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {formatLocalDateTime(e.occurred_at, prefs.tz)}
              </span>
            </div>
          </SwipeRow>

          {menuFor === e.id && (
            <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
              {onEdit && (
                <button
                  type="button"
                  aria-label={`Edit note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                  onClick={() => { onEdit(e); setMenuFor(null) }}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
              <button
                type="button"
                aria-label={`Delete note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => deleteNote(e)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                type="button"
                className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => setMenuFor(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
