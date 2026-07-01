// Wraps Intl.DateTimeFormat with a safe-fallback to UTC for invalid timezones.
// Intl throws RangeError on bogus TZ strings; user_prefs.tz could in theory
// be corrupted, so we want a graceful degrade rather than a crash mid-render.

export function formatLocalDate(iso: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso)
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(date)
  }
}

export function formatLocalDateTime(iso: string, tz: string): string {
  return formatLocalDate(iso, tz, { dateStyle: 'medium', timeStyle: 'short', hour12: false })
}

export function formatLocalDateOnly(iso: string, tz: string): string {
  return formatLocalDate(iso, tz, { dateStyle: 'medium' })
}
