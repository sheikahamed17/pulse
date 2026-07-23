/** "YYYY-MM-DD" of an ISO instant as seen in the given IANA tz (UTC fallback for an invalid tz). */
export function localDayKey(iso: string, tz: string): string {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  }
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

type OverdueTask = { id: string; title: string; due_at: string | null; nudge_muted_at?: string | null }

/**
 * The daily overdue re-nudge descriptor for a task, or null when it should not fire:
 * no due date, muted, or not overdue since a PRIOR local day (avoids doubling the
 * due-day's `due-` notification). notifId is per local day → at most one nudge/day.
 */
export function overdueNudge(task: OverdueTask, nowIso: string, tz: string): { notifId: string; title: string; body: string } | null {
  if (!task.due_at) return null
  if (task.nudge_muted_at) return null
  const today = localDayKey(nowIso, tz)
  const dueDay = localDayKey(task.due_at, tz)
  if (dueDay >= today) return null // string compare works for YYYY-MM-DD; not overdue since a prior day
  const days = Math.round((Date.parse(today) - Date.parse(dueDay)) / 86_400_000)
  return {
    notifId: `overdue-${task.id}-${today}`,
    title: `Task overdue: ${task.title.slice(0, 60)}`,
    body: days === 1 ? 'Overdue 1 day' : `Overdue ${days} days`,
  }
}
