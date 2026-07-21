/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'
type Row = Record<string, unknown>

const sendPushMock = vi.fn().mockResolvedValue({ sent: 1, pruned: 0 })
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }) }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: sendPushMock }))

let state: {
  budgets: Row[]; money: Row[]; prefs: Row[]; notifs: Row[]; categories: Row[]
}
const inserted: Row[] = []

function makeFakeDb() {
  const rowsFor = (t: string) =>
    t === 'budgets' ? state.budgets
    : t === 'money_entries' ? state.money
    : t === 'user_prefs' ? state.prefs
    : t === 'push_notifications' ? state.notifs
    : t === 'categories' ? state.categories
    : t === 'fx_rates' ? [] : []
  const chain = (table: string) => {
    const wheres: Array<[string, string, unknown]> = []
    const c: any = {
      where: (col: string, op: string, val: unknown) => { wheres.push([col, op, val]); return c },
      select: () => c, selectAll: () => c,
      execute: async () => rowsFor(table).filter(r => wheres.every(([k, op, v]) =>
        op === 'is' && v === null ? r[k] == null : op === '=' ? r[k] === v : true)),
      executeTakeFirst: async () => {
        const list = rowsFor(table).filter(r => wheres.every(([k, op, v]) =>
          op === 'is' && v === null ? r[k] == null : op === '=' ? r[k] === v : true))
        if (table === 'push_notifications') {
          const id = wheres.find(([k]) => k === 'id')?.[2]
          return state.notifs.find(n => n.id === id) ?? null
        }
        return list[0] ?? null
      },
    }
    return c
  }
  return {
    selectFrom: chain,
    insertInto: () => ({ values: (v: Row) => ({ execute: async () => { inserted.push(v); state.notifs.push(v) } }) }),
  } as any
}
let fakeDb: any
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const { POST } = await import('@/app/api/cron/budgets/route')
const req = (secret = TEST_SECRET) => new Request('http://x/api/cron/budgets', { method: 'POST', headers: { authorization: `Bearer ${secret}` } })

describe('/api/cron/budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserted.length = 0
    state = {
      budgets: [{ id: 'cat-1', user_id: 'u1', category_id: 'cat-1', amount: 100000, currency: 'INR', deleted_at: null }],
      money: [{ id: 'm1', user_id: 'u1', category_id: 'cat-1', amount: 100000, currency: 'INR', direction: 'out', occurred_at: new Date().toISOString(), deleted_at: null }],
      prefs: [{ user_id: 'u1', primary_currency: 'INR', tz: 'Asia/Kolkata' }],
      notifs: [],
      categories: [{ id: 'cat-1', name: 'Food' }],
    }
    fakeDb = makeFakeDb()
  })

  it('rejects without auth', async () => {
    expect((await POST(new Request('http://x/api/cron/budgets', { method: 'POST' }))).status).toBe(403)
  })
  it('creates 80% and 100% alerts when a budget is fully spent', async () => {
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(2)   // 80 + 100 both crossed at 100%
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })
  it('is idempotent (second run inserts nothing)', async () => {
    await POST(req())
    inserted.length = 0
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(0)
  })
  it('no alert below 80%', async () => {
    state.money = [{ ...state.money[0], amount: 70000 }]
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(0)
  })
})
