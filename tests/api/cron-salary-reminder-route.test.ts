/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'
type Row = Record<string, unknown>

const sendPushMock = vi.fn().mockResolvedValue({ sent: 1, pruned: 0 })
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }) }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: sendPushMock }))

let state: { prefs: Row[]; notifs: Row[] }
const inserted: Row[] = []

function makeFakeDb() {
  const rowsFor = (t: string) => (t === 'user_prefs' ? state.prefs : t === 'push_notifications' ? state.notifs : [])
  const match = (r: Row, wheres: Array<[string, string, unknown]>) =>
    wheres.every(([k, op, v]) => (op === '=' ? r[k] === v : true))
  const chain = (table: string) => {
    const wheres: Array<[string, string, unknown]> = []
    const c: any = {
      where: (col: string, op: string, val: unknown) => { wheres.push([col, op, val]); return c },
      select: () => c, selectAll: () => c,
      execute: async () => rowsFor(table).filter(r => match(r, wheres)),
      executeTakeFirst: async () => {
        if (table === 'push_notifications') {
          const id = wheres.find(([k]) => k === 'id')?.[2]
          return state.notifs.find(n => n.id === id) ?? null
        }
        return rowsFor(table).filter(r => match(r, wheres))[0] ?? null
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

const { POST } = await import('@/app/api/cron/salary-reminder/route')
const req = (secret = TEST_SECRET) => new Request('http://x/api/cron/salary-reminder', { method: 'POST', headers: { authorization: `Bearer ${secret}` } })
const created = async (r: Response) => (await r.json() as { reminders_created: number }).reminders_created

describe('/api/cron/salary-reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T03:00:00Z')) // Mon 31 Aug = last working day; 08:30 IST
    inserted.length = 0
    state = {
      prefs: [{ user_id: 'u1', primary_currency: 'INR', tz: 'Asia/Kolkata', salary_reminder: 1 }],
      notifs: [],
    }
    fakeDb = makeFakeDb()
  })
  afterEach(() => { vi.useRealTimers() })

  it('rejects without auth', async () => {
    expect((await POST(new Request('http://x/api/cron/salary-reminder', { method: 'POST' }))).status).toBe(403)
  })

  it('creates a one-per-month reminder on the last working day for an opted-in user', async () => {
    const res = await POST(req())
    expect(await created(res)).toBe(1)
    expect(inserted[0].id).toBe('salary-u1-2026-08')
    expect(String(inserted[0].title)).toContain('salary')
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })

  it('is idempotent within the month (second run inserts nothing)', async () => {
    await POST(req())
    inserted.length = 0
    expect(await created(await POST(req()))).toBe(0)
  })

  it('does nothing on a day that is not the last working day', async () => {
    vi.setSystemTime(new Date('2026-08-28T03:00:00Z')) // Fri, but not the last working day
    expect(await created(await POST(req()))).toBe(0)
  })

  it('ignores users who did not opt in', async () => {
    state.prefs = [{ user_id: 'u2', primary_currency: 'INR', tz: 'Asia/Kolkata', salary_reminder: 0 }]
    expect(await created(await POST(req()))).toBe(0)
  })

  it('respects the user tz for the last-working-day check', async () => {
    // 20:00Z Aug 31 == 01:30 IST on Sep 1 → Aug's last working day has passed in IST
    vi.setSystemTime(new Date('2026-08-31T20:00:00Z'))
    expect(await created(await POST(req()))).toBe(0)
  })
})
