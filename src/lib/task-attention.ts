import { localDayKey } from '@/lib/overdue-nudge'
import type { TaskRow } from '@/lib/dexie'

export type Attention = { dueToday: number; overdue: number }

export function taskAttention(tasks: TaskRow[], nowIso: string, tz: string): Attention {
  const today = localDayKey(nowIso, tz)
  let dueToday = 0
  let overdue = 0
  for (const t of tasks) {
    if (t.completed_at || t.deleted_at || t.nudge_muted_at || !t.due_at) continue
    const day = localDayKey(t.due_at, tz)
    if (day < today) overdue++
    else if (day === today) dueToday++
  }
  return { dueToday, overdue }
}

export function attentionCopy(a: Attention): string | null {
  const parts: string[] = []
  if (a.dueToday > 0) parts.push(`${a.dueToday} due today`)
  if (a.overdue > 0) parts.push(`${a.overdue} overdue`)
  return parts.length ? parts.join(' · ') : null
}
