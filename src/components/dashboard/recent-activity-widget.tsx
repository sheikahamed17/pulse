'use client'

import { useMemo } from 'react'
import { recentActivity } from '@/lib/recent-activity'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useTasks } from '@/hooks/use-tasks'
import { useLearnings } from '@/hooks/use-learnings'
import { useNotes } from '@/hooks/use-notes'
import { EntryTimestamp } from '@/components/entry-timestamp'

type Props = { userId: string }

const GLYPHS = {
  money: '💰',
  task: '✓',
  learning: '💡',
  note: '📝',
}

export function RecentActivityWidget({ userId }: Props) {
  const money = useMoneyEntries(userId)
  const tasks = useTasks(userId, 'all')
  const learnings = useLearnings(userId)
  const notes = useNotes(userId)

  const items = useMemo(
    () => recentActivity({ money, tasks, learnings, notes }, 6),
    [money, tasks, learnings, notes],
  )

  if (items.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">No recent activity</div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map(item => (
        <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2 text-sm min-h-[44px]">
          <span className="flex-shrink-0">{GLYPHS[item.kind]}</span>
          <span className="flex-1 truncate">{item.label}</span>
          <EntryTimestamp occurredAt={item.at} className="text-xs text-muted-foreground flex-shrink-0" />
        </li>
      ))}
    </ul>
  )
}
