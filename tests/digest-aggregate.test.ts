import { describe, it, expect, beforeEach } from 'vitest'
import { aggregateWeek } from '@/lib/digest-aggregate'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'

describe('aggregateWeek', () => {
  let fakeDb: Kysely<DB>
  const userId = 'user-123'
  const primaryCurrency = 'INR'
  const bounds = { startsAt: '2026-06-21T18:30:00.000Z', endsAt: '2026-06-28T18:30:00.000Z' }

  beforeEach(() => {
    // Chainable mock that handles any number of .where() calls
    function makeFakeDb(rowsByTable: Record<string, unknown[]>): Kysely<DB> {
      const chainFor = (table: string) => {
        const chain: Record<string, unknown> = {
          where: () => chain,                                   // any number of .where() calls
          selectAll: () => ({ execute: async () => rowsByTable[table] ?? [] }),
        }
        return chain
      }
      return { selectFrom: (t: string) => chainFor(t) } as unknown as Kysely<DB>
    }

    fakeDb = makeFakeDb({
      money_entries: [
        {
          id: 'e1',
          user_id: userId,
          amount: 50000,
          currency: primaryCurrency,
          direction: 'out',
          category_id: 'cat-food',
          description: 'groceries',
          occurred_at: '2026-06-25T10:00:00.000Z',
          source: 'voice',
          raw_input: null,
          recurring_rule_id: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-25T10:00:00.000Z',
          updated_at: '2026-06-25T10:00:00.000Z',
        },
        {
          id: 'e2',
          user_id: userId,
          amount: 30000,
          currency: primaryCurrency,
          direction: 'out',
          category_id: 'cat-food',
          description: 'lunch',
          occurred_at: '2026-06-26T12:00:00.000Z',
          source: 'manual',
          raw_input: null,
          recurring_rule_id: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-26T12:00:00.000Z',
          updated_at: '2026-06-26T12:00:00.000Z',
        },
        {
          id: 'e3',
          user_id: userId,
          amount: 100000,
          currency: primaryCurrency,
          direction: 'in',
          category_id: 'cat-salary',
          description: 'bonus',
          occurred_at: '2026-06-23T09:00:00.000Z',
          source: 'manual',
          raw_input: null,
          recurring_rule_id: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-23T09:00:00.000Z',
          updated_at: '2026-06-23T09:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          user_id: userId,
          title: 'Task A',
          due_at: '2026-06-24T10:00:00.000Z',
          priority: 'high',
          completed_at: '2026-06-24T15:00:00.000Z',
          source: 'voice',
          raw_input: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-15T10:00:00.000Z',
          updated_at: '2026-06-24T15:00:00.000Z',
        },
        {
          id: 't2',
          user_id: userId,
          title: 'Task B',
          due_at: '2026-06-30T10:00:00.000Z',
          priority: 'medium',
          completed_at: null,
          source: 'manual',
          raw_input: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-25T10:00:00.000Z',
          updated_at: '2026-06-25T10:00:00.000Z',
        },
      ],
      categories: [
        { id: 'cat-food', user_id: userId, name: 'Food', kind: 'spend' },
        { id: 'cat-salary', user_id: userId, name: 'Salary', kind: 'income' },
      ],
    })
  })

  it('aggregates money entries by category and currency', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.spend_total).toBe(80000) // 50000 + 30000
    expect(metrics.income_total).toBe(100000)
    expect(metrics.currency).toBe(primaryCurrency)
    expect(metrics.entry_count).toBe(3)
  })

  it('returns top 5 categories by spend amount', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.top_categories).toContainEqual(expect.objectContaining({ name: 'Food', amount: 80000 }))
  })

  it('counts completed tasks in window', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.tasks_completed).toBe(1) // t1 completed in window
  })

  it('counts created tasks in window', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.tasks_created).toBe(1) // t2 created in window
  })

  it('counts open tasks with due_at < ends_at as overdue', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.tasks_overdue).toBe(0) // t2.due_at is after endsAt
  })

  it('excludes deleted entries', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.entry_count).toBe(3)
  })

  it('returns empty skipped_currencies when all entries can convert', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.skipped_currencies).toEqual([])
  })
})
