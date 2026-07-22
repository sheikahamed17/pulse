import { computeNextDue, type RecurringRule } from '@/lib/recurring'
import type { TaskPayload } from '@/lib/op-schemas/task'

export type RecurPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'

type Priority = 'low' | 'medium' | 'high'

/**
 * The create-payload for the NEXT instance of a recurring task, due
 * `completedAt + interval`. Date math delegates to computeNextDue, anchored to the
 * completion time (the after-completion model).
 */
export function nextRecurringTaskPayload(
  task: { title: string; priority: Priority; recur_period: RecurPeriod; recur_interval: number; tags: string[]; project_id: string | null },
  completedAtIso: string,
): TaskPayload {
  const rule: RecurringRule = {
    id: 'recurring-task',
    period: task.recur_period,
    interval_count: task.recur_interval,
    anchor_at: completedAtIso,
    next_due_at: completedAtIso,
    occurrences_so_far: 0,
    end_condition_kind: 'never',
    end_until: null,
    end_count: null,
    is_active: 1,
  }
  return {
    title: task.title,
    priority: task.priority,
    due_at: computeNextDue(rule),
    completed_at: null,
    source: 'recurring',
    raw_input: null,
    recur_period: task.recur_period,
    recur_interval: task.recur_interval,
    tags: task.tags,
    project_id: task.project_id,
  }
}

/**
 * The ops for toggling a task's completion. Completing a recurring task clears its
 * recurrence (so re-completing can't double-spawn) and returns the next instance's
 * create payload; every other toggle is a plain completed_at update with no next.
 */
export function taskCompletionOps(
  task: { completed_at: string | null; title: string; priority: Priority; recur_period: RecurPeriod | null; recur_interval: number | null; tags: string[]; project_id: string | null },
  nowIso: string,
): { update: Partial<TaskPayload>; next: TaskPayload | null } {
  const completing = !task.completed_at
  if (completing && task.recur_period != null && task.recur_interval != null) {
    return {
      update: { completed_at: nowIso, recur_period: null, recur_interval: null },
      next: nextRecurringTaskPayload(
        { title: task.title, priority: task.priority, recur_period: task.recur_period, recur_interval: task.recur_interval, tags: task.tags, project_id: task.project_id },
        nowIso,
      ),
    }
  }
  return { update: { completed_at: completing ? nowIso : null }, next: null }
}

/** Human string for a cadence: "daily" / "every 3 days" / "weekly" / "every 2 weeks". */
export function formatRecurrence(period: RecurPeriod, interval: number): string {
  if (interval === 1) return period
  const unit = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'year'
  return `every ${interval} ${unit}s`
}
