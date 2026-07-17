'use client'

import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useLearnings } from '@/hooks/use-learnings'
import { formatLocalDateTime } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import type { LearningRow } from '@/lib/dexie'
import { cn } from '@/lib/utils'

type Props = { userId: string; selectedTag: string | null }

function useLongPress<T>(onLongPress: (arg: T) => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  return {
    onPointerDown: (arg: T) => { timerRef.current = setTimeout(() => onLongPress(arg), ms) },
    onPointerUp:   () => { if (timerRef.current) clearTimeout(timerRef.current) },
    onPointerLeave:() => { if (timerRef.current) clearTimeout(timerRef.current) },
  }
}

export function LearningList({ userId, selectedTag }: Props) {
  const learnings = useLearnings(userId)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const longPress = useLongPress<LearningRow>(e => setMenuFor(e.id))

  const filtered = selectedTag
    ? learnings.filter(e => e.tags.includes(selectedTag))
    : learnings

  async function deleteLearning(e: LearningRow) {
    const op = await generateOp({
      entity_kind: 'learning', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
  }

  if (filtered.length === 0) {
    return (
      <div className="glass-soft rounded-2xl p-4 text-center text-sm text-muted-foreground">
        {selectedTag ? `No learnings with tag "${selectedTag}".` : "No learnings yet — say 'I learned…'"}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {filtered.map(e => (
        <li
          key={e.id}
          className="glass-soft rounded-2xl relative flex flex-col gap-2 p-3"
          onPointerDown={() => longPress.onPointerDown(e)}
          onPointerUp={longPress.onPointerUp}
          onPointerLeave={longPress.onPointerLeave}
        >
          <p className="text-sm">{e.text}</p>
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
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-2">
              {e.attribution && (
                <span className="truncate">— {e.attribution}</span>
              )}
            </div>
            <span className="font-mono tabular-nums flex-shrink-0">
              {formatLocalDateTime(e.occurred_at, prefs.tz)}
            </span>
          </div>

          {menuFor === e.id && (
            <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => deleteLearning(e)}
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
