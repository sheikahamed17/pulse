/* eslint-disable @typescript-eslint/no-explicit-any */
// Fake DB fixtures use `any` to avoid ~50 lines of recursive generic type definitions.
// Test fixture, not production code — `any` is the right escape valve here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'

interface TestUser {
  id: string
  email: string
  created_at: number
  updated_at: number
}

interface TestUserPrefs {
  user_id: string
  primary_currency: string
  tz: string
  updated_at: string
}

interface TestMoneyEntry {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: string
  category_id: string | null
  description: string
  occurred_at: string
  source: string
  raw_input: string | null
  recurring_rule_id: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

interface TestTask {
  id: string
  user_id: string
  title: string
  due_at: string
  priority: string
  completed_at: string | null
  source: string
  raw_input: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

const userTable: TestUser[] = [
  { id: 'user-1', email: 'a@example.com', created_at: 0, updated_at: 0 },
  { id: 'user-2', email: 'b@example.com', created_at: 0, updated_at: 0 },
]

const userPrefsTable: TestUserPrefs[] = [
  { user_id: 'user-1', primary_currency: 'INR', tz: 'Asia/Kolkata', updated_at: '2026-06-29T02:30:00.000Z' },
  { user_id: 'user-2', primary_currency: 'USD', tz: 'America/New_York', updated_at: '2026-06-29T02:30:00.000Z' },
]

const moneyEntriesTable: TestMoneyEntry[] = [
  {
    id: 'e1', user_id: 'user-1', amount: 50000, currency: 'INR', direction: 'out',
    category_id: null, description: 'test', occurred_at: '2026-06-25T10:00:00.000Z',
    source: 'manual', raw_input: null, recurring_rule_id: null,
    field_hlcs: '{}', deleted_at: null, created_at: '2026-06-25T10:00:00.000Z', updated_at: '2026-06-25T10:00:00.000Z',
  },
]

const tasksTable: TestTask[] = [
  {
    id: 't1', user_id: 'user-1', title: 'test task', due_at: '2026-06-25T10:00:00.000Z',
    priority: 'high', completed_at: null, source: 'manual', raw_input: null,
    field_hlcs: '{}', deleted_at: null, created_at: '2026-06-25T10:00:00.000Z', updated_at: '2026-06-25T10:00:00.000Z',
  },
]

const opLogTable: unknown[] = []
const insightsTable: unknown[] = []
const pushNotificationsTable: unknown[] = []
const categoriesTable: unknown[] = []
const fxRatesTable: unknown[] = []

// Chainable fake DB with support for executeTakeFirst, select, and op_log mapping
const fakeDb = {
  selectFrom: (table: string) => {
    let data: (TestUser | TestUserPrefs | TestMoneyEntry | TestTask | unknown)[] = []
    if (table === 'user') data = userTable
    else if (table === 'user_prefs') data = userPrefsTable
    else if (table === 'money_entries') data = moneyEntriesTable
    else if (table === 'tasks') data = tasksTable
    else if (table === 'categories') data = categoriesTable
    else if (table === 'fx_rates') data = fxRatesTable
    // CRITICALLY: map op_log to read from the SAME array that inserts push into
    else if (table === 'op_log') data = opLogTable
    else if (table === 'insights') data = insightsTable

    // Helper to apply where filters
    const applyWheres = (
      rows: (TestUser | TestUserPrefs | TestMoneyEntry | TestTask | unknown)[],
      wheres: Array<{ col: string; op: string; val: unknown }>,
    ) => {
      return rows.filter((r: any) => {
        for (const w of wheres) {
          const { col, op, val } = w
          if (table === 'money_entries') {
            if (col === 'user_id' && r.user_id !== val) return false
            if (col === 'occurred_at' && op === '>=' && r.occurred_at < (val as string)) return false
            if (col === 'occurred_at' && op === '<' && r.occurred_at >= (val as string)) return false
            if (col === 'deleted_at' && op === 'is' && r.deleted_at !== null) return false
          }
          if (table === 'tasks') {
            if (col === 'user_id' && r.user_id !== val) return false
            if (col === 'deleted_at' && op === 'is' && r.deleted_at !== null) return false
            if (col === 'completed_at' && op === 'is' && r.completed_at !== null && val === null) return false
            if (col === 'completed_at' && op === 'is not' && r.completed_at === null && val === null) return false
          }
          if (table === 'user_prefs') {
            if (col === 'user_id' && r.user_id !== val) return false
          }
          if (table === 'categories') {
            if (col === 'user_id' && r.user_id !== val) return false
          }
          if (table === 'op_log') {
            if (col === 'id' && r.id !== val) return false
          }
          if (table === 'insights') {
            if (col === 'id' && r.id !== val) return false
          }
        }
        return true
      })
    }

    const wheres: Array<{ col: string; op: string; val: unknown }> = []

    // Builder with full chainable support
    const builder = {
      where: (col: string, op: string, val: unknown) => {
        const newWheres = [...wheres, { col, op, val }]
        return makeBuilder(newWheres)
      },
      selectAll: () => ({
        executeTakeFirst: async () => {
          const filtered = applyWheres(data, wheres)
          return filtered[0] ?? undefined
        },
        execute: async () => {
          return applyWheres(data, wheres)
        },
      }),
      select: (col: string) => ({
        executeTakeFirst: async () => {
          const filtered = applyWheres(data, wheres)
          const row = filtered[0]
          if (!row) return undefined
          return { [col]: (row as Record<string, unknown>)[col] }
        },
      }),
    }

    function makeBuilder(currentWheres: Array<{ col: string; op: string; val: unknown }>) {
      return {
        where: (col: string, op: string, val: unknown) => {
          const newWheres = [...currentWheres, { col, op, val }]
          return makeBuilder(newWheres)
        },
        selectAll: () => ({
          executeTakeFirst: async () => {
            const filtered = applyWheres(data, currentWheres)
            return filtered[0] ?? undefined
          },
          execute: async () => {
            return applyWheres(data, currentWheres)
          },
        }),
        select: (col: string) => ({
          executeTakeFirst: async () => {
            const filtered = applyWheres(data, currentWheres)
            const row = filtered[0]
            if (!row) return undefined
            return { [col]: (row as Record<string, unknown>)[col] }
          },
        }),
      }
    }

    return builder
  },
  insertInto: (table: string) => ({
    values: (values: unknown) => {
      const executeInsert = async () => {
        if (table === 'op_log') opLogTable.push(values)
        if (table === 'insights') insightsTable.push(values)
        if (table === 'push_notifications') pushNotificationsTable.push(values)
      }
      const executeInsertWithConflict = async () => {
        const v = values as Record<string, unknown>
        // For op_log, onConflict doNothing means skip if id exists
        if (table === 'op_log') {
          const existing = opLogTable.find((op: any) => op.id === v.id)
          if (existing) return // onConflict doNothing: skip
          opLogTable.push(values)
        } else {
          // For other tables, just insert
          if (table === 'insights') insightsTable.push(values)
          if (table === 'push_notifications') pushNotificationsTable.push(values)
        }
      }
      return {
        onConflict: (_oc: unknown) => ({
          execute: executeInsertWithConflict,
        }),
        execute: executeInsert,
      }
    },
  }),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: vi.fn().mockResolvedValue({ sent: 1, pruned: 0 }) }))
vi.mock('@/lib/digest-aggregate', () => ({
  aggregateWeek: vi.fn(async () => {
    const hasEntries = moneyEntriesTable.length > 0 || tasksTable.length > 0
    return {
      currency: 'INR',
      spend_total: hasEntries ? 1000 : 0,
      income_total: 0,
      top_categories: [],
      tasks_completed: tasksTable.length > 0 ? 1 : 0,
      tasks_created: tasksTable.length > 0 ? 1 : 0,
      tasks_overdue: 0,
      skipped_currencies: [],
      entry_count: moneyEntriesTable.length + tasksTable.length,
      learnings_added: 0,
      notes_added: 0,
      top_learning_tags: [],
    }
  }),
}))
vi.mock('@/lib/agents/digest-agent', () => ({ writeDigestNarrative: vi.fn().mockResolvedValue('Test summary'), fallbackSummary: vi.fn(() => 'Fallback summary') }))
vi.mock('@/lib/materialize', () => ({
  materializeRow: vi.fn(async (db, op: any, userId) => {
    // Mock materializeRow to actually insert into insightsTable for insights ops
    if (op.entity_kind === 'insight') {
      insightsTable.push({
        id: op.entity_id,
        user_id: userId,
        summary: 'Test summary',
        metrics: op.payload?.metrics ?? '{}',
        period: op.payload?.period ?? 'weekly',
        starts_at: op.payload?.starts_at ?? '2026-06-22T00:00:00.000Z',
        ends_at: op.payload?.ends_at ?? '2026-06-29T00:00:00.000Z',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }),
}))

const { POST } = await import('@/app/api/cron/digest/route')
const { sendPushToUser } = await import('@/lib/web-push')

function cronReq(secret = TEST_SECRET) {
  return new Request('http://x/api/cron/digest', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('/api/cron/digest', () => {
  beforeEach(() => {
    opLogTable.length = 0
    insightsTable.length = 0
    pushNotificationsTable.length = 0
    // Restore fixture tables
    moneyEntriesTable.length = 0
    moneyEntriesTable.push({
      id: 'e1', user_id: 'user-1', amount: 50000, currency: 'INR', direction: 'out',
      category_id: null, description: 'test', occurred_at: '2026-06-25T10:00:00.000Z',
      source: 'manual', raw_input: null, recurring_rule_id: null,
      field_hlcs: '{}', deleted_at: null, created_at: '2026-06-25T10:00:00.000Z', updated_at: '2026-06-25T10:00:00.000Z',
    })
    tasksTable.length = 0
    tasksTable.push({
      id: 't1', user_id: 'user-1', title: 'test task', due_at: '2026-06-25T10:00:00.000Z',
      priority: 'high', completed_at: null, source: 'manual', raw_input: null,
      field_hlcs: '{}', deleted_at: null, created_at: '2026-06-25T10:00:00.000Z', updated_at: '2026-06-25T10:00:00.000Z',
    })
    vi.mocked(sendPushToUser).mockClear()
    // Fix 3: Pin time to 2026-06-29T02:30:00.000Z (Monday 08:00 Kolkata, Sunday in Americas)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-29T02:30:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects without auth', async () => {
    const res = await POST(new Request('http://x/api/cron/digest', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('rejects wrong bearer', async () => {
    const res = await POST(cronReq('wrong-secret-12345678901234567890abcd'))
    expect(res.status).toBe(403)
  })

  it('processes users and returns count', async () => {
    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { users_processed: number; digests_created: number }
    expect(body.users_processed).toBeGreaterThan(0)
  })

  it('creates op_log entry with idempotency key', async () => {
    await POST(cronReq())
    const opLogEntry = opLogTable.find((op: any) => op.entity_kind === 'insight') as any
    expect(opLogEntry).toBeDefined()
    expect(opLogEntry.id).toMatch(/^insight-weekly-/)
  })

  it('inserts push notification row', async () => {
    await POST(cronReq())
    const notifRow = pushNotificationsTable.find((n: any) => n.user_id === 'user-1')
    expect(notifRow).toBeDefined()
  })

  it('skips users with empty week', async () => {
    // Clear entries so aggregation has zero entry_count
    moneyEntriesTable.length = 0
    tasksTable.length = 0
    const res = await POST(cronReq())
    const _body = await res.json() as { users_processed: number; digests_created: number }
    // digests_created should be 0 because week is empty
    expect(opLogTable.filter((op: any) => op.entity_kind === 'insight')).toHaveLength(0)
  })

  it('skips user whose local time is not Monday (dual-fire safety)', async () => {
    // Add a user with America/Los_Angeles timezone
    const laUser = { id: 'user-3', email: 'la@example.com', created_at: 0, updated_at: 0 }
    const laPrefs = { user_id: 'user-3', primary_currency: 'USD', tz: 'America/Los_Angeles', updated_at: '2026-06-29T02:30:00.000Z' }
    userTable.push(laUser)
    userPrefsTable.push(laPrefs)

    // At 2026-06-29T02:30Z it is Monday 08:00 in Asia/Kolkata (processed)
    // but it is Sunday 18:30 PST in America/Los_Angeles (skipped)
    await POST(cronReq())

    // user-3 should be skipped (not Monday locally)
    const laInsight = opLogTable.find(op => (op as Record<string, unknown>).entity_kind === 'insight' && (op as Record<string, unknown>).user_id === 'user-3')
    expect(laInsight).toBeUndefined() // user-3 skipped due to local non-Monday
  })

  it('is idempotent on second run', async () => {
    await POST(cronReq())
    const firstCount = opLogTable.length
    await POST(cronReq())
    const secondCount = opLogTable.length
    expect(secondCount).toBe(firstCount) // no new entries added
  })

  it('sends push to user after inserting notification row', async () => {
    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { digests_created: number }
    expect(body.digests_created).toBeGreaterThan(0)
    expect(vi.mocked(sendPushToUser)).toHaveBeenCalled()
  })

  it('skips when the insights projection already exists', async () => {
    // Pre-populate the insights table with a row for user-1
    // weekStart = bounds.startsAt.slice(0, 10) = '2026-06-21' (UTC date)
    const existingInsight = {
      id: 'insight-user-1-2026-06-21',
      user_id: 'user-1',
      summary: 'Existing summary',
      metrics: '{}',
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      created_at: '2026-06-28T00:00:00.000Z',
      updated_at: '2026-06-28T00:00:00.000Z',
    }
    insightsTable.push(existingInsight)

    // Also populate for user-2 to ensure it doesn't generate a new one
    insightsTable.push({
      id: 'insight-user-2-2026-06-21',
      user_id: 'user-2',
      summary: 'Existing summary for user 2',
      metrics: '{}',
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      created_at: '2026-06-28T00:00:00.000Z',
      updated_at: '2026-06-28T00:00:00.000Z',
    })

    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { digests_created: number }
    // Should not create any new digests since insights rows already exist for both users
    expect(body.digests_created).toBe(0)
    expect(opLogTable.filter((op: any) => op.entity_kind === 'insight')).toHaveLength(0)
  })

  it('recovers when op_log exists but insights row is missing (crash recovery)', async () => {
    // Simulate a partial failure: op_log was created but materialize never ran
    // weekStart = '2026-06-21' (UTC date from bounds.startsAt.slice(0, 10))
    const partialOp = {
      id: 'insight-weekly-user-1-2026-06-21',
      user_id: 'user-1',
      hlc: '2026-06-28T01:00:00.000Z-0',
      device_id: 'cron',
      entity_kind: 'insight',
      entity_id: 'insight-user-1-2026-06-21',
      op_type: 'create',
      payload: '{"period":"weekly"}',
      schema_version: 1,
      applied_at: 1234567890,
    }
    opLogTable.push(partialOp)
    // Note: NO corresponding insights row — that's the crash condition

    // For user-2, ensure it has an insights row so it's skipped
    insightsTable.push({
      id: 'insight-user-2-2026-06-21',
      user_id: 'user-2',
      summary: 'Existing',
      metrics: '{}',
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      created_at: '2026-06-28T00:00:00.000Z',
      updated_at: '2026-06-28T00:00:00.000Z',
    })

    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { digests_created: number }
    // The cron SHOULD generate and materialize the insight for user-1, NOT skip
    // Since the op_log already has that id and we have onConflict-doNothing,
    // the op insert will be a safe no-op, but materialize runs and creates the projection
    // user-2 has an existing insights row so it's skipped
    expect(body.digests_created).toBe(1) // only user-1 creates
    // The insights row should now be created by materializeRow
    const newInsight = insightsTable.find((i: any) => i.id === 'insight-user-1-2026-06-21')
    expect(newInsight).toBeDefined()
  })
})
