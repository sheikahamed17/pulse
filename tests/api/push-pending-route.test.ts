/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SESSION = {
  user: { id: 'user1', email: 'test@example.com' },
}

const fakeDb = {
  selectFrom: vi.fn(),
  updateTable: vi.fn(),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: 'test' } }),
}))

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  createDb: () => fakeDb,
}))

const { GET } = await import('@/app/api/push/pending/route')

describe('/api/push/pending', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValue(TEST_SESSION as any)
  })

  it('GET rejects without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null)

    const res = await GET(new Request('http://x/api/push/pending'))
    expect(res.status).toBe(401)
  })

  it('GET returns unread notifications (≤10, oldest first)', async () => {
    const notifs = [
      { id: 'n1', user_id: 'user1', title: 'First', body: 'Body1', url: '/app', created_at: '2026-01-01T00:00:00Z', read_at: null },
      { id: 'n2', user_id: 'user1', title: 'Second', body: 'Body2', url: '/app?tab=tasks', created_at: '2026-01-01T01:00:00Z', read_at: null },
    ]

    const chain: any = {
      where: () => chain,
      orderBy: () => ({ limit: () => ({ selectAll: () => ({ execute: async () => notifs }) }) }),
    }
    fakeDb.selectFrom.mockReturnValue(chain)

    fakeDb.updateTable.mockReturnValue({
      set: (_vals: any) => ({
        where: () => ({
          execute: async () => {},
        }),
      }),
    })

    const res = await GET(new Request('http://x/api/push/pending'))
    expect(res.status).toBe(200)
    const data = await res.json() as { notifications: any[] }
    expect(data.notifications).toHaveLength(2)
    expect(data.notifications[0].id).toBe('n1')
    expect(data.notifications[1].id).toBe('n2')
  })

  it('GET marks all returned rows as read', async () => {
    const notifs = [
      { id: 'n1', user_id: 'user1', title: 'Test', body: 'Body', url: '/app', created_at: '2026-01-01T00:00:00Z', read_at: null },
    ]

    const updateCalls: any[] = []

    const chain: any = {
      where: () => chain,
      orderBy: () => ({ limit: () => ({ selectAll: () => ({ execute: async () => notifs }) }) }),
    }
    fakeDb.selectFrom.mockReturnValue(chain)

    fakeDb.updateTable.mockReturnValue({
      set: (vals: any) => ({
        where: () => ({
          execute: async () => { updateCalls.push(vals) },
        }),
      }),
    })

    const res = await GET(new Request('http://x/api/push/pending'))
    expect(res.status).toBe(200)
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0].read_at).toBeTruthy()
  })

  it('GET returns empty array on second call (all marked read)', async () => {
    const chain: any = {
      where: () => chain,
      orderBy: () => ({ limit: () => ({ selectAll: () => ({ execute: async () => [] }) }) }),
    }
    fakeDb.selectFrom.mockReturnValue(chain)

    const res = await GET(new Request('http://x/api/push/pending'))
    expect(res.status).toBe(200)
    const data = await res.json() as { notifications: any[] }
    expect(data.notifications).toHaveLength(0)
  })

  it('GET limits to 10 notifications', async () => {
    const notifs = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`,
      user_id: 'user1',
      title: `Title ${i}`,
      body: `Body ${i}`,
      url: '/app',
      created_at: new Date(2026, 0, 1, i).toISOString(),
      read_at: null,
    }))

    const chain: any = {
      where: () => chain,
      orderBy: () => ({
        limit: (n: number) => ({
          selectAll: () => ({
            execute: async () => notifs.slice(0, n),
          }),
        }),
      }),
    }
    fakeDb.selectFrom.mockReturnValue(chain)

    fakeDb.updateTable.mockReturnValue({
      set: () => ({
        where: () => ({
          execute: async () => {},
        }),
      }),
    })

    const res = await GET(new Request('http://x/api/push/pending'))
    const data = await res.json() as { notifications: any[] }
    expect(data.notifications.length).toBeLessThanOrEqual(10)
  })
})
