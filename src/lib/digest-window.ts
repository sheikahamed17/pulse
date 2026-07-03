/**
 * Digest window utilities — compute the most-recently-completed Monday-to-Monday
 * week in a user's local timezone (returned as UTC ISO boundaries), DST-correct
 * via Intl.DateTimeFormat offset probing. Falls back to UTC on an invalid tz.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

/** Render a UTC instant into a timezone's local Y/M/D/H/M + weekday. UTC fallback on invalid tz. */
function localParts(iso: string, tz: string): LocalParts {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'long',
    })
    const m: Record<string, string> = {}
    for (const p of fmt.formatToParts(new Date(iso))) {
      if (p.type !== 'literal') m[p.type] = p.value
    }
    let hour = parseInt(m.hour ?? '0', 10)
    if (hour === 24) hour = 0 // some engines emit '24' at midnight
    return {
      year: parseInt(m.year, 10),
      month: parseInt(m.month, 10),
      day: parseInt(m.day, 10),
      hour,
      minute: parseInt(m.minute ?? '0', 10),
      weekday: WEEKDAYS.indexOf(m.weekday ?? 'Sunday'),
    }
  } catch {
    const d = new Date(iso)
    return {
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay(),
    }
  }
}

/** Is the given UTC instant a Monday in the user's local timezone? */
export function isLocalMonday(nowIso: string, tz: string): boolean {
  return localParts(nowIso, tz).weekday === 1
}

/**
 * Convert a target local wall-clock (y,mo,d,h,mi) in tz to the UTC instant whose
 * local rendering equals it. Two-step offset method: guess the wall time as UTC,
 * measure the tz offset at that guess, correct, then re-probe once to settle any
 * DST-boundary drift. (00:00-Monday targets never land on a transition instant.)
 */
function localWallClockToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): string {
  const target = Date.UTC(y, mo - 1, d, h, mi)
  const p1 = localParts(new Date(target).toISOString(), tz)
  const local1 = Date.UTC(p1.year, p1.month - 1, p1.day, p1.hour, p1.minute)
  let utcMs = target - (local1 - target)
  const p2 = localParts(new Date(utcMs).toISOString(), tz)
  const local2 = Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute)
  utcMs += target - local2
  return new Date(utcMs).toISOString()
}

/**
 * The most-recently-completed Monday→Monday local week, as UTC ISO boundaries.
 * startsAt = prior week's Monday 00:00 local (inclusive); endsAt = current week's
 * Monday 00:00 local (exclusive). Each Monday is offset-probed independently, so a
 * DST transition inside the week yields the correct 167h/169h span.
 */
export function priorWeekBounds(nowIso: string, tz: string): { startsAt: string; endsAt: string } {
  const p = localParts(nowIso, tz)
  const sinceMonday = p.weekday === 0 ? 6 : p.weekday - 1 // Sun→6, Mon→0, Tue→1, ...
  // Calendar arithmetic on the LOCAL date via a UTC scratch date (date-only, no offset involved):
  const curMon = new Date(Date.UTC(p.year, p.month - 1, p.day))
  curMon.setUTCDate(curMon.getUTCDate() - sinceMonday) // this week's Monday (local date)
  const priorMon = new Date(curMon)
  priorMon.setUTCDate(priorMon.getUTCDate() - 7)        // prior week's Monday (local date)
  return {
    startsAt: localWallClockToUtc(priorMon.getUTCFullYear(), priorMon.getUTCMonth() + 1, priorMon.getUTCDate(), 0, 0, tz),
    endsAt: localWallClockToUtc(curMon.getUTCFullYear(), curMon.getUTCMonth() + 1, curMon.getUTCDate(), 0, 0, tz),
  }
}
