import type { LearningRow } from '@/lib/dexie'
import type { QueryLearningPlan } from '@/lib/query-plans'

function sortLearnings(learnings: LearningRow[]): LearningRow[] {
  return [...learnings].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
}

export function filterLearningsForQuery(
  learnings: LearningRow[],
  plan: QueryLearningPlan,
): LearningRow[] {
  // Exclude tombstones
  let live = learnings.filter(l => !l.deleted_at)

  // Apply search filter (case-insensitive substring in text or attribution)
  if (plan.search) {
    const searchLower = plan.search.toLowerCase()
    live = live.filter(l =>
      l.text.toLowerCase().includes(searchLower) ||
      (l.attribution && l.attribution.toLowerCase().includes(searchLower))
    )
  }

  // Apply tag filter (any of the specified tags)
  if (plan.tags.length > 0) {
    live = live.filter(l =>
      plan.tags.some(tag => l.tags.includes(tag))
    )
  }

  // Apply period filter if present
  if (plan.period) {
    live = live.filter(l =>
      l.occurred_at >= plan.period!.from && l.occurred_at < plan.period!.to
    )
  }

  // Sort results by occurred_at descending
  return sortLearnings(live)
}
