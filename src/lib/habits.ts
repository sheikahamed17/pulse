/**
 * Pure helper to add n days to a YYYY-MM-DD date string.
 * Parses as UTC, adds days, reformats to ISO string.
 * @param dayStr - Date string in YYYY-MM-DD format
 * @param n - Number of days to add (can be negative)
 * @returns Date string in YYYY-MM-DD format
 */
export function addDays(dayStr: string, n: number): string {
  const date = new Date(dayStr + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

/**
 * Parse a comma-separated schedule string into a Set of weekday numbers (0-6).
 * null/empty/whitespace-only → null (daily).
 * Out-of-range weekdays filtered; empty result → null (daily).
 * @param schedule - Comma-separated weekday numbers, or null/undefined
 * @returns Set<number> or null (for daily)
 */
export function parseSchedule(schedule: string | null | undefined): Set<number> | null {
  if (!schedule || schedule.trim() === '') {
    return null
  }

  const tokens = schedule.split(',').map((s) => {
    const n = parseInt(s.trim(), 10)
    return isNaN(n) ? null : n
  })

  const set = new Set<number>()
  for (const n of tokens) {
    if (n !== null && n >= 0 && n <= 6) {
      set.add(n)
    }
  }

  return set.size === 0 ? null : set
}

/**
 * Check if a schedule includes a specific day.
 * null schedule → true (daily).
 * @param schedule - Comma-separated weekday numbers, or null/undefined
 * @param dayStr - Date string in YYYY-MM-DD format
 * @returns true if scheduled on that day's weekday, or if schedule is null
 */
export function isScheduledOn(schedule: string | null | undefined, dayStr: string): boolean {
  const parsed = parseSchedule(schedule)
  if (parsed === null) {
    return true // Daily
  }
  const date = new Date(dayStr + 'T00:00:00Z')
  return parsed.has(date.getUTCDay())
}

export type HabitStreaks = {
  current: number
  longest: number
  completedToday: boolean
  dueToday: boolean
  rate30: number
}

/**
 * Derives streaks and completion stats from a habit's completion days.
 * Pure function; does not read the real clock.
 * @param days - Array of completion dates in YYYY-MM-DD format (will be deduped)
 * @param today - Today's date in YYYY-MM-DD format (user's tz)
 * @param schedule - Comma-separated weekday numbers (null/empty = daily)
 * @returns Object with current streak, longest streak, completion-today flag, dueToday flag, and 30-day rate
 */
export function habitStreaks(days: string[], today: string, schedule: string | null = null): HabitStreaks {
  // Dedup via Set
  const set = new Set(days)

  // dueToday: is today a scheduled day?
  const dueToday = isScheduledOn(schedule, today)

  // completedToday
  const completedToday = set.has(today)

  // current: walk backward from today, skipping non-scheduled days
  let current = 0
  let checkDay = today
  const iterBound = 400

  for (let iter = 0; iter < iterBound; iter++) {
    if (!isScheduledOn(schedule, checkDay)) {
      // Non-scheduled day: skip
      checkDay = addDays(checkDay, -1)
      continue
    }

    // Scheduled day
    if (set.has(checkDay)) {
      // Completed
      current++
      checkDay = addDays(checkDay, -1)
    } else if (checkDay === today) {
      // Today not done yet: skip, don't break
      checkDay = addDays(checkDay, -1)
    } else {
      // Scheduled but missing: break
      break
    }
  }

  // longest: longest run of consecutive SCHEDULED-and-completed days
  let longest = 0
  if (set.size > 0) {
    const sortedDays = Array.from(set).sort()

    // Find the earliest day in the completion set
    const earliest = sortedDays[0]

    // Walk from earliest to today, tracking the longest run of scheduled-and-completed
    let runLength = 0
    let checkDayLongest = earliest

    // Walk day by day to today
    while (checkDayLongest <= today) {
      if (isScheduledOn(schedule, checkDayLongest)) {
        // Scheduled day
        if (set.has(checkDayLongest)) {
          // Completed
          runLength++
        } else {
          // Missing: reset run
          runLength = 0
        }
      }
      // Non-scheduled days: neutral (neither extend nor break)

      longest = Math.max(longest, runLength)
      checkDayLongest = addDays(checkDayLongest, 1)
    }
  }

  // rate30: completed scheduled days / scheduled days in [today-29..today]
  const thirtyDaysAgo = addDays(today, -29)
  let scheduledInWindow = 0
  let completedInWindow = 0

  let checkWindow = thirtyDaysAgo
  while (checkWindow <= today) {
    if (isScheduledOn(schedule, checkWindow)) {
      scheduledInWindow++
      if (set.has(checkWindow)) {
        completedInWindow++
      }
    }
    checkWindow = addDays(checkWindow, 1)
  }

  const rate30 = scheduledInWindow === 0 ? 0 : completedInWindow / scheduledInWindow

  return { current, longest, completedToday, dueToday, rate30 }
}
