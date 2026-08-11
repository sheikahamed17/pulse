import { formatDistanceToNow } from 'date-fns'
import { formatLocalDateTime } from '@/lib/format'

const RELATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Relative ("2 hours ago") when < 7 days old, else null; absolute always set. */
export function entryTimeLabel(iso: string, tz: string, nowMs: number): { relative: string | null; absolute: string } {
  const t = Date.parse(iso)
  const absolute = formatLocalDateTime(iso, tz)
  if (isNaN(t) || nowMs - t > RELATIVE_WINDOW_MS || t > nowMs) return { relative: null, absolute }
  return { relative: formatDistanceToNow(new Date(t), { addSuffix: true }), absolute }
}
