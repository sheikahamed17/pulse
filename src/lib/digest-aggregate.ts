import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'
import { convertToPrimary } from '@/lib/fx'

export type DigestMetrics = {
  currency: string
  spend_total: number
  income_total: number
  top_categories: Array<{ name: string; amount: number }>
  tasks_completed: number
  tasks_created: number
  tasks_overdue: number
  skipped_currencies: string[]
  entry_count: number
}

export async function aggregateWeek(
  db: Kysely<DB>,
  userId: string,
  bounds: { startsAt: string; endsAt: string },
  primaryCurrency: string,
): Promise<DigestMetrics> {
  // Fetch money entries in the window (non-deleted)
  const entries = await db
    .selectFrom('money_entries')
    .where('user_id', '=', userId)
    .where('occurred_at', '>=', bounds.startsAt)
    .where('occurred_at', '<', bounds.endsAt)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  // Fetch categories (for category names)
  const categories = await db
    .selectFrom('categories')
    .where('user_id', '=', userId)
    .selectAll()
    .execute()

  const categoryById = new Map(categories.map(c => [c.id, c]))

  // Convert all entries and accumulate totals
  let spendTotal = 0
  let incomeTotal = 0
  const categorySpend = new Map<string, number>() // category name → amount
  const skippedCurrencies = new Set<string>()

  for (const entry of entries) {
    let convertedAmount = entry.amount

    if (entry.currency !== primaryCurrency) {
      const converted = await convertToPrimary(db, entry.amount, entry.currency, primaryCurrency, entry.occurred_at)
      if (!converted) {
        // Conversion failed — skip this entry's amount, record currency
        skippedCurrencies.add(entry.currency)
        continue
      }
      convertedAmount = converted.amount
    }

    if (entry.direction === 'out') {
      spendTotal += convertedAmount
    } else {
      incomeTotal += convertedAmount
    }

    // Track spend by category (income entries not included in top_categories per spec)
    if (entry.direction === 'out') {
      const catName = entry.category_id ? categoryById.get(entry.category_id)?.name : 'Uncategorized'
      const key = catName ?? 'Uncategorized'
      categorySpend.set(key, (categorySpend.get(key) ?? 0) + convertedAmount)
    }
  }

  // Top 5 categories by spend
  const topCategories = Array.from(categorySpend.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // Task metrics
  const tasksInWindow = await db
    .selectFrom('tasks')
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  let tasksCompleted = 0
  let tasksCreated = 0
  for (const t of tasksInWindow) {
    if (t.completed_at && t.completed_at >= bounds.startsAt && t.completed_at < bounds.endsAt) {
      tasksCompleted++
    }
    if (t.created_at >= bounds.startsAt && t.created_at < bounds.endsAt) {
      tasksCreated++
    }
  }

  // Tasks overdue: open (completed_at is null) with due_at < bounds.endsAt
  const tasksOverdue = tasksInWindow.filter(
    t => t.completed_at === null && t.due_at && t.due_at < bounds.endsAt,
  ).length

  return {
    currency: primaryCurrency,
    spend_total: spendTotal,
    income_total: incomeTotal,
    top_categories: topCategories,
    tasks_completed: tasksCompleted,
    tasks_created: tasksCreated,
    tasks_overdue: tasksOverdue,
    skipped_currencies: Array.from(skippedCurrencies),
    entry_count: entries.length,
  }
}
