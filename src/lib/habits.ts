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

export type HabitStreaks = {
  current: number
  longest: number
  completedToday: boolean
  rate30: number
}

/**
 * Derives streaks and completion stats from a habit's completion days.
 * Pure function; does not read the real clock.
 * @param days - Array of completion dates in YYYY-MM-DD format (will be deduped)
 * @param today - Today's date in YYYY-MM-DD format (user's tz)
 * @returns Object with current streak, longest streak, completion-today flag, and 30-day rate
 */
export function habitStreaks(days: string[], today: string): HabitStreaks {
  // Dedup via Set
  const set = new Set(days)

  // completedToday
  const completedToday = set.has(today)

  // current: start from today if completed, else yesterday
  const anchor = completedToday ? today : addDays(today, -1)
  let current = 0
  if (set.has(anchor)) {
    let checkDay = anchor
    while (set.has(checkDay)) {
      current++
      checkDay = addDays(checkDay, -1)
    }
  }

  // longest: find the longest consecutive run in the set
  let longest = 0
  if (set.size > 0) {
    // Sort days for processing
    const sortedDays = Array.from(set).sort()

    let runLength = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const prevDay = sortedDays[i - 1]
      const currDay = sortedDays[i]
      const nextDayFromPrev = addDays(prevDay, 1)

      if (nextDayFromPrev === currDay) {
        // Consecutive
        runLength++
      } else {
        // Gap
        longest = Math.max(longest, runLength)
        runLength = 1
      }
    }
    // Don't forget the last run
    longest = Math.max(longest, runLength)
  }

  // rate30: count days in [today-29 .. today] / 30
  const thirtyDaysAgo = addDays(today, -29)
  let count30 = 0
  for (const day of set) {
    if (day >= thirtyDaysAgo && day <= today) {
      count30++
    }
  }
  const rate30 = count30 / 30

  return { current, longest, completedToday, rate30 }
}
