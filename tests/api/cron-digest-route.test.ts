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

    // Helper to apply where filters
    const applyWheres = (
      rows: (TestUser | TestUserPrefs | TestMoneyEntry | TestTask | unknown)[],
      wheres: Array<{ col: string; op: string; val: unknown }>,
    ) => {
      return rows.filter(r => {
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
      return {
        onConflict: (_oc: unknown) => ({
          execute: executeInsert,
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

const { POST } = await import('@/app/api/cron/digest/route')

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
    const opLogEntry = opLogTable.find(op => op.entity_kind === 'insight')
    expect(opLogEntry).toBeDefined()
    expect(opLogEntry.id).toMatch(/^insight-weekly-/)
  })

  it('inserts push notification row', async () => {
    await POST(cronReq())
    const notifRow = pushNotificationsTable.find(n => n.user_id === 'user-1')
    expect(notifRow).toBeDefined()
  })

  it('skips users with empty week', async () => {
    // Clear entries so aggregation has zero entry_count
    moneyEntriesTable.length = 0
    tasksTable.length = 0
    const res = await POST(cronReq())
    const _body = await res.json() as { users_processed: number; digests_created: number }
    // digests_created should be 0 because week is empty
    expect(opLogTable.filter(op => op.entity_kind === 'insight')).toHaveLength(0)
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
})
