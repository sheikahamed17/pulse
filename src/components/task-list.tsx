'use client'

import { useRef, useState } from 'react'
import { Circle, CheckCircle2, Trash2 } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useTasks, type TaskFilter } from '@/hooks/use-tasks'
import { formatLocalDateTime } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import type { TaskRow } from '@/lib/dexie'

type Props = { userId: string; filter: TaskFilter }

function useLongPress<T>(onLongPress: (arg: T) => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  return {
    onPointerDown: (arg: T) => { timerRef.current = setTimeout(() => onLongPress(arg), ms) },
    onPointerUp:   () => { if (timerRef.current) clearTimeout(timerRef.current) },
    onPointerLeave:() => { if (timerRef.current) clearTimeout(timerRef.current) },
  }
}

export function TaskList({ userId, filter }: Props) {
  const tasks = useTasks(userId, filter)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const longPress = useLongPress<TaskRow>(t => setMenuFor(t.id))

  async function toggleComplete(t: TaskRow) {
    const op = await generateOp({
      entity_kind: 'task', entity_id: t.id,
      op_type: 'update',
      payload: { completed_at: t.completed_at ? null : new Date().toISOString() },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function deleteTask(t: TaskRow) {
    const op = await generateOp({
      entity_kind: 'task', entity_id: t.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
  }

  if (tasks.length === 0) {
    return (
      <div className="glass-soft rounded-2xl p-4 text-center text-sm text-muted-foreground">
        {filter === 'open' && 'No open tasks. Add one by saying or typing "remind me to…"'}
        {filter === 'completed' && 'No completed tasks yet.'}
        {filter === 'all' && 'No tasks yet.'}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map(t => {
        const isCompleted = !!t.completed_at
        const isOverdue = !isCompleted && t.due_at && t.due_at < new Date().toISOString()
        return (
          <li
            key={t.id}
            className="glass-soft rounded-2xl relative flex items-start justify-between gap-3 p-3 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            onPointerDown={() => longPress.onPointerDown(t)}
            onPointerUp={longPress.onPointerUp}
            onPointerLeave={longPress.onPointerLeave}
            onKeyDown={(keyEvent) => {
              if (keyEvent.target !== keyEvent.currentTarget) return
              if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                if (keyEvent.key === ' ') keyEvent.preventDefault()
                setMenuFor(t.id)
              }
            }}
            tabIndex={0}
          >
            <button
              type="button"
              onClick={() => toggleComplete(t)}
              className="flex flex-1 items-start gap-2 text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
              aria-label={isCompleted ? `Mark "${t.title}" open` : `Complete "${t.title}"`}
            >
              {isCompleted ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-2" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <div className="flex flex-col">
                <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
                  {t.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.priority !== 'medium' && (
                    <span className={`mr-2 ${t.priority === 'high' ? 'text-destructive' : ''}`}>
                      {t.priority}
                    </span>
                  )}
                  {t.due_at && (
                    <span className={`font-mono tabular-nums ${isOverdue ? 'text-warning' : ''}`}>
                      due {formatLocalDateTime(t.due_at, prefs.tz)}
                      {isOverdue && ' · overdue'}
                    </span>
                  )}
                </span>
              </div>
            </button>

            {menuFor === t.id && (
              <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
                <button
                  type="button"
                  aria-label={`Delete task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                  onClick={() => deleteTask(t)}
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
        )
      })}
    </ul>
  )
}
