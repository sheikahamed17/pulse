'use client'

import { useMemo } from 'react'
import { useTasks } from '@/hooks/use-tasks'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { EntryTimestamp } from '@/components/entry-timestamp'

type Props = { userId: string }

// YYYY-MM-DD for a given instant in the user's timezone (en-CA yields ISO order).
// Mirrors src/lib/format.ts's safe-fallback for a corrupt tz string.
function localDay(ms: number, tz: string): string {
  try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: tz }) }
  catch { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'UTC' }) }
}

export function TodayTasksWidget({ userId }: Props) {
  const tasks = useTasks(userId, 'open')
  const { prefs } = useUserPrefs()
  const tz = prefs.tz

  const { overdue, dueTodayOrSoon } = useMemo(() => {
    const nowMs = new Date().getTime()
    // Compare on the user's LOCAL calendar day, not UTC (a task due "today" for a
    // user east/west of UTC must land under today, not yesterday/tomorrow).
    const today = localDay(nowMs, tz)
    const in7 = localDay(nowMs + 7 * 24 * 60 * 60 * 1000, tz)

    const overdue: typeof tasks = []
    const dueTodayOrSoon: typeof tasks = []

    for (const task of tasks) {
      if (!task.due_at) continue
      const dueDay = localDay(new Date(task.due_at).getTime(), tz)
      if (dueDay < today) {
        overdue.push(task)
      } else if (dueDay === today || dueDay < in7) {
        dueTodayOrSoon.push(task)
      }
    }

    return { overdue, dueTodayOrSoon }
  }, [tasks, tz])

  const combinedTasks = [...overdue, ...dueTodayOrSoon].slice(0, 8)

  if (combinedTasks.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">Nothing due</div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {combinedTasks.map(task => (
        <li key={task.id} className="flex items-start gap-2 text-sm min-h-[44px]">
          <span className="flex-1">{task.title || '(no title)'}</span>
          {task.due_at && <EntryTimestamp occurredAt={task.due_at} className="text-xs text-muted-foreground flex-shrink-0" />}
        </li>
      ))}
    </ul>
  )
}
