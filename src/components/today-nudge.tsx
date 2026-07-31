'use client'

import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { useTasks } from '@/hooks/use-tasks'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { taskAttention, attentionCopy } from '@/lib/task-attention'

export function TodayNudge({ userId, onGoToTasks }: { userId: string; onGoToTasks: () => void }) {
  const tasks = useTasks(userId, 'open')
  const { prefs } = useUserPrefs()
  const copy = useMemo(
    () => attentionCopy(taskAttention(tasks, new Date().toISOString(), prefs.tz)),
    [tasks, prefs.tz],
  )
  if (!copy) return null
  return (
    <button
      type="button"
      onClick={onGoToTasks}
      aria-label={`${copy} — go to Tasks`}
      className="glass flex w-full items-center gap-2 rounded-2xl px-4 py-3 min-h-[44px] text-sm hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
    >
      <Clock className="h-4 w-4 flex-shrink-0 text-warning" />
      <span className="flex-1 text-left font-medium">{copy}</span>
      <span className="flex-shrink-0 text-xs text-muted-foreground">Tasks →</span>
    </button>
  )
}
