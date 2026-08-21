/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'
type Row = Record<string, unknown>

const sendPushMock = vi.fn().mockResolvedValue({ sent: 1, pruned: 0 })
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }) }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: sendPushMock }))

let state: {
  rules: Row[]; prefs: Row[]; notifs: Row[]; fxRates: Row[]
}
const inserted: Row[] = []

function makeFakeDb() {
  const rowsFor = (t: string) =>
    t === 'recurring_rules' ? state.rules
    : t === 'user_prefs' ? state.prefs
    : t === 'push_notifications' ? state.notifs
    : t === 'fx_rates' ? state.fxRates : []
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

const mockUpcomingOccurrences = vi.fn()
vi.mock('@/lib/forecast', () => ({ upcomingOccurrences: mockUpcomingOccurrences }))

const { POST } = await import('@/app/api/cron/bill-reminders/route')
const req = (secret = TEST_SECRET) => new Request('http://x/api/cron/bill-reminders', { method: 'POST', headers: { authorization: `Bearer ${secret}` } })

describe('/api/cron/bill-reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserted.length = 0
    state = {
      rules: [
        {
          id: 'rule-1',
          user_id: 'u1',
          amount: 1500000,
          currency: 'INR',
          direction: 'out',
          category_id: 'cat-1',
          description: 'Rent',
          period: 'monthly',
          interval_count: 1,
          anchor_at: '2026-01-01T00:00:00Z',
          next_due_at: '2026-08-24T00:00:00Z',
          is_active: 1,
          deleted_at: null,
        },
      ],
      prefs: [{ user_id: 'u1', primary_currency: 'INR', tz: 'Asia/Kolkata', fx_overrides: null }],
      notifs: [],
      fxRates: [],
    }
    fakeDb = makeFakeDb()
    mockUpcomingOccurrences.mockResolvedValue([
      {
        ruleId: 'rule-1',
        date: '2026-08-24T00:00:00Z',
        amount: 1500000,
        currency: 'INR',
        direction: 'out',
        category_id: 'cat-1',
        description: 'Rent',
      },
    ])
  })

  it('rejects without auth', async () => {
    expect((await POST(new Request('http://x/api/cron/bill-reminders', { method: 'POST' }))).status).toBe(403)
  })

  it('creates a reminder for an active out-rule due within the lead window', async () => {
    const res = await POST(req())
    const body = await res.json() as { reminders_created: number }
    expect(body.reminders_created).toBe(1)
    expect(sendPushMock).toHaveBeenCalledTimes(1)
    expect(inserted.length).toBe(1)
    expect(inserted[0].title).toContain('Bill due')
    expect(inserted[0].body).toContain('₹15,000')
  })

  it('is idempotent (second run inserts nothing)', async () => {
    await POST(req())
    inserted.length = 0
    const res = await POST(req())
    const body = await res.json() as { reminders_created: number }
    expect(body.reminders_created).toBe(0)
  })

  it('does not create reminder for out-rule due after the lead window', async () => {
    // upcomingOccurrences returns empty when rule is due beyond the lead window
    mockUpcomingOccurrences.mockResolvedValue([])
    const res = await POST(req())
    const body = await res.json() as { reminders_created: number }
    expect(body.reminders_created).toBe(0)
  })

  it('does not create reminder for inactive rule', async () => {
    state.rules[0].is_active = 0
    const res = await POST(req())
    const body = await res.json() as { reminders_created: number }
    expect(body.reminders_created).toBe(0)
  })

  it('does not create reminder for in-rule (direction=in)', async () => {
    state.rules[0].direction = 'in'
    const res = await POST(req())
    const body = await res.json() as { reminders_created: number }
    expect(body.reminders_created).toBe(0)
  })

  it('calls sendPushToUser for users with new reminders', async () => {
    await POST(req())
    expect(sendPushMock).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ VAPID_PRIVATE_KEY: undefined, VAPID_PUBLIC_KEY: undefined }),
      'u1',
    )
  })
})
