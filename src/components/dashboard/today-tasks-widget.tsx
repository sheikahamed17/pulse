'use client'

import { useMemo } from 'react'
import { useTasks } from '@/hooks/use-tasks'
import { EntryTimestamp } from '@/components/entry-timestamp'

type Props = { userId: string }

export function TodayTasksWidget({ userId }: Props) {
  const tasks = useTasks(userId, 'open')

  const { overdue, dueTodayOrSoon } = useMemo(() => {
    const nowMs = new Date().getTime()
    const now = new Date(nowMs).toISOString().split('T')[0] // YYYY-MM-DD in local tz

    const overdue: typeof tasks = []
    const dueTodayOrSoon: typeof tasks = []

    for (const task of tasks) {
      if (!task.due_at) continue
      const dueDate = task.due_at.split('T')[0]
      if (dueDate < now) {
        overdue.push(task)
      } else if (dueDate === now || dueDate < new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) {
        dueTodayOrSoon.push(task)
      }
    }

    return { overdue, dueTodayOrSoon }
  }, [tasks])

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
