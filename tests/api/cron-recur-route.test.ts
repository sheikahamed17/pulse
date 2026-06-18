import { describe, it, expect, vi } from 'vitest'

const dueRules = [
  {
    id: 'rule-1', user_id: 'u1',
    amount: 2500000, currency: 'INR', direction: 'out',
    category_id: 'cat-rent', description: 'rent',
    period: 'monthly', interval_count: 1,
    anchor_at: '2026-05-01T00:00:00.000Z',
    next_due_at: '2026-06-01T00:00:00.000Z',
    end_condition_kind: 'never', end_until: null, end_count: null,
    occurrences_so_far: 1,
    is_active: 1,
    field_hlcs: '{}',
    deleted_at: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  },
]

const inserts: unknown[] = []
const updates: unknown[] = []

function createDbChain() {
  return {
    where: () => createDbChain(),
    select: () => ({
      executeTakeFirst: async () => dueRules[0] ?? undefined,
    }),
    selectAll: () => ({
      limit: () => ({
        execute: async () => dueRules,
      }),
    }),
  }
}

const fakeDb = {
  selectFrom: (table: string) => {
    if (table === 'recurring_rules') {
      return {
        where: () => ({
          where: () => ({
            where: () => ({
              selectAll: () => ({
                limit: () => ({
                  execute: async () => dueRules,
                }),
              }),
              select: () => ({
                executeTakeFirst: async () => dueRules[0] ?? undefined,
              }),
            }),
          }),
          select: () => ({
            executeTakeFirst: async () => dueRules[0] ?? undefined,
          }),
        }),
      }
    }
    // For op_log queries
    return {
      where: () => ({
        select: () => ({
          executeTakeFirst: async () => undefined,
        }),
      }),
    }
  },
  insertInto: (table: string) => ({
    values: (v: unknown) => ({
      onConflict: () => ({ execute: async () => { inserts.push({ table, v }) } }),
      execute: async () => { inserts.push({ table, v }) },
    }),
  }),
  updateTable: (table: string) => ({
    set: (v: unknown) => ({ where: () => ({ execute: async () => { updates.push({ table, v }) } }) }),
  }),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const { POST } = await import('@/app/api/cron/recur/route')

function cronReq() {
  return new Request('http://x/api/cron/recur', {
    method: 'POST',
    headers: { 'cf-cron': '0 2 * * *' },
  })
}

describe('/api/cron/recur', () => {
  it('rejects requests without a cron marker', async () => {
    const res = await POST(new Request('http://x/api/cron/recur', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('processes a due rule: inserts an op_log row + a money_entries row + updates the rule', async () => {
    inserts.length = 0; updates.length = 0
    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { processed: number }
    expect(body.processed).toBeGreaterThanOrEqual(1)
    expect(inserts.some(i => (i as { table: string }).table === 'op_log')).toBe(true)
    expect(inserts.some(i => (i as { table: string }).table === 'money_entries')).toBe(true)
    expect(updates.some(u => (u as { table: string }).table === 'recurring_rules')).toBe(true)
  })
})
