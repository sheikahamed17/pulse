'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useHabits } from '@/hooks/use-habits'
import { useHabitLogs } from '@/hooks/use-habit-logs'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { habitStreaks } from '@/lib/habits'
import type { HabitRow } from '@/lib/dexie'

type Props = { userId: string }

function localDay(ms: number, tz: string): string {
  try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: tz }) }
  catch { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'UTC' }) }
}

export function HabitsWidget({ userId }: Props) {
  const habits = useHabits(userId)
  const logs = useHabitLogs(userId)
  const { prefs } = useUserPrefs()

  const todayStr = useMemo(() => {
    const nowMs = new Date().getTime()
    const tz = prefs.tz ?? 'Asia/Kolkata'
    return localDay(nowMs, tz)
  }, [prefs.tz])

  async function toggleToday(habit: HabitRow) {
    const habitLogs = logs.filter(l => l.habit_id === habit.id && !l.deleted_at)
    const days = habitLogs.map(l => l.day)
    const s = habitStreaks(days, todayStr)

    const logId = `hlog-${habit.id}-${todayStr}`

    if (s.completedToday) {
      const op = await generateOp({
        entity_kind: 'habit_log',
        entity_id: logId,
        op_type: 'delete',
        payload: {},
        user_id: userId,
      })
      await applyLocalOp(op)
    } else {
      const op = await generateOp({
        entity_kind: 'habit_log',
        entity_id: logId,
        op_type: 'create',
        payload: {
          habit_id: habit.id,
          day: todayStr,
        },
        user_id: userId,
      })
      await applyLocalOp(op)
    }

    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
        <p>Add habits in Habits</p>
        <Link
          href="/habits"
          className="text-xs text-blue-500 hover:underline"
        >
          Go to Habits
        </Link>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {habits.map(h => {
        const habitLogs = logs.filter(l => l.habit_id === h.id && !l.deleted_at)
        const days = habitLogs.map(l => l.day)
        const s = habitStreaks(days, todayStr)

        return (
          <li key={h.id} className="flex items-center gap-2 text-sm min-h-[44px]">
            <button
              type="button"
              onClick={() => toggleToday(h)}
              style={{ height: '44px', minWidth: '44px' }}
              className="flex-shrink-0 flex items-center justify-center rounded-lg border border-white/20 hover:bg-white/5 transition-colors"
              aria-label={`Mark ${h.name} done`}
            >
              {s.completedToday ? '✓' : '○'}
            </button>
            <span className="flex-1">
              {h.icon && <span className="mr-1">{h.icon}</span>}
              {h.name}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">🔥 {s.current}</span>
          </li>
        )
      })}
    </ul>
  )
}
