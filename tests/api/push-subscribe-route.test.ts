/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SESSION = {
  user: { id: 'user1', email: 'test@example.com' },
}

const fakeDb = {
  selectFrom: vi.fn(),
  insertInto: vi.fn(),
  updateTable: vi.fn(),
  deleteFrom: vi.fn(),
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

const { POST, DELETE } = await import('@/app/api/push/subscribe/route')

describe('/api/push/subscribe', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValue(TEST_SESSION as any)
  })

  it('POST rejects without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null)

    const body = { endpoint: 'https://push.example.com', keys: { p256dh: 'abc', auth: 'def' } }
    const res = await POST(
      new Request('http://x/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('POST validates endpoint URL', async () => {
    const body = { endpoint: 'not-a-url', keys: { p256dh: 'abc', auth: 'def' } }
    const res = await POST(
      new Request('http://x/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST validates keys shape', async () => {
    const body = { endpoint: 'https://push.example.com', keys: { p256dh: 'abc' } } // missing auth
    const res = await POST(
      new Request('http://x/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST upserts subscription by endpoint', async () => {
    const inserted: any[] = []
    fakeDb.insertInto.mockReturnValue({
      values: (vals: any) => ({
        onConflict: (cb: (oc: any) => any) => {
          const oc = {
            column: () => ({
              doUpdateSet: (updates: any) => {
                inserted.push({ vals, updates })
                return oc
              },
            }),
          }
          cb(oc)
          return { execute: async () => {} }
        },
      }),
    })

    const body = {
      endpoint: 'https://push.example.com/v1/send/abc',
      keys: { p256dh: 'abc123', auth: 'def456' },
    }
    const res = await POST(
      new Request('http://x/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(201)
    const data = await res.json() as { ok: boolean }
    expect(data.ok).toBe(true)
    expect(inserted.length).toBe(1)
  })

  it('DELETE rejects without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null)

    const body = { endpoint: 'https://push.example.com' }
    const res = await DELETE(
      new Request('http://x/api/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('DELETE removes subscription by endpoint', async () => {
    const deleted: any[] = []
    fakeDb.deleteFrom.mockReturnValue({
      where: () => ({
        where: () => ({
          execute: async () => { deleted.push(true) },
        }),
      }),
    })

    const body = { endpoint: 'https://push.example.com' }
    const res = await DELETE(
      new Request('http://x/api/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(204)
    expect(deleted.length).toBe(1)
  })
})
