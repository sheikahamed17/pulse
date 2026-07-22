/* eslint-disable @typescript-eslint/no-explicit-any */
// The Kysely onConflict callback's builder shape is generic + recursive across
// Kysely's internal types; typing it precisely here is fixture-only ceremony.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const userPrefsTable: Array<{ user_id: string; primary_currency: string; tz: string; fx_overrides?: string | null; updated_at: string }> = []

const fakeDb = {
  selectFrom: (_table: string) => ({
    where: () => ({
      selectAll: () => ({
        executeTakeFirst: async () => userPrefsTable[0],
      }),
    }),
  }),
  insertInto: (_table: string) => ({
    values: (v: { user_id: string; primary_currency: string; tz: string; fx_overrides?: string | null; updated_at: string }) => ({
      onConflict: (cb: (oc: any) => any) => {
        const builder = {
          column: (_col: string) => ({
            doUpdateSet: (updates: { primary_currency: string; tz: string; fx_overrides?: string | null; updated_at: string }) => ({
              execute: async () => {
                const existing = userPrefsTable.findIndex(r => r.user_id === v.user_id)
                const payload = { ...v, ...updates }
                if (existing >= 0) userPrefsTable[existing] = payload
                else userPrefsTable.push(payload)
              },
            }),
          }),
        }
        return cb(builder)
      },
    }),
  }),
}

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const { GET, PUT } = await import('@/app/api/user-prefs/route')

describe('/api/user-prefs', () => {
  beforeEach(() => { userPrefsTable.length = 0 })

  describe('GET', () => {
    it('returns defaults (INR + Asia/Kolkata) when no row exists', async () => {
      const res = await GET(new Request('http://x/api/user-prefs'))
      expect(res.status).toBe(200)
      const body = await res.json() as { primary_currency: string; tz: string }
      expect(body.primary_currency).toBe('INR')
      expect(body.tz).toBe('Asia/Kolkata')
    })

    it('returns the row when one exists', async () => {
      userPrefsTable.push({ user_id: 'u1', primary_currency: 'USD', tz: 'America/New_York', updated_at: '2026-06-18T00:00:00Z' })
      const res = await GET(new Request('http://x/api/user-prefs'))
      const body = await res.json() as { primary_currency: string; tz: string }
      expect(body.primary_currency).toBe('USD')
      expect(body.tz).toBe('America/New_York')
    })

    it('returns 401 without a session', async () => {
      const { getSession } = await import('@/lib/auth')
      ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
      const res = await GET(new Request('http://x/api/user-prefs'))
      expect(res.status).toBe(401)
    })

    it('parses fx_overrides JSON from the row (dropping invalid entries)', async () => {
      userPrefsTable.push({ user_id: 'u1', primary_currency: 'INR', tz: 'UTC', fx_overrides: '{"AED":3.95,"XYZ":9,"USD":-1}', updated_at: '2026-07-22T00:00:00Z' })
      const res = await GET(new Request('http://x/api/user-prefs'))
      const body = await res.json() as { fx_overrides: Record<string, number> }
      expect(body.fx_overrides).toEqual({ AED: 3.95 }) // XYZ not a currency, USD negative → dropped
    })

    it('defaults fx_overrides to {} when no row exists', async () => {
      const res = await GET(new Request('http://x/api/user-prefs'))
      const body = await res.json() as { fx_overrides: Record<string, number> }
      expect(body.fx_overrides).toEqual({})
    })
  })

  describe('PUT', () => {
    it('upserts the row', async () => {
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'EUR', tz: 'Europe/Berlin' }),
      }))
      expect(res.status).toBe(200)
      expect(userPrefsTable).toHaveLength(1)
      expect(userPrefsTable[0].primary_currency).toBe('EUR')
      expect(userPrefsTable[0].tz).toBe('Europe/Berlin')
    })

    it('persists fx_overrides as a JSON string', async () => {
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'INR', tz: 'UTC', fx_overrides: { AED: 3.95 } }),
      }))
      expect(res.status).toBe(200)
      expect(userPrefsTable[0].fx_overrides).toBe('{"AED":3.95}')
      const body = await res.json() as { fx_overrides: Record<string, number> }
      expect(body.fx_overrides).toEqual({ AED: 3.95 })
    })

    it('rejects a non-positive fx_overrides value', async () => {
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'INR', tz: 'UTC', fx_overrides: { AED: -3 } }),
      }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid currency code', async () => {
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'XYZ', tz: 'UTC' }),
      }))
      expect(res.status).toBe(400)
    })

    it('rejects empty tz', async () => {
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'INR', tz: '' }),
      }))
      expect(res.status).toBe(400)
    })

    it('returns 401 without a session', async () => {
      const { getSession } = await import('@/lib/auth')
      ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'INR', tz: 'UTC' }),
      }))
      expect(res.status).toBe(401)
    })

    it('PUT: persists exact values from the doUpdateSet callback (covers upsert on existing row)', async () => {
      // Seed an existing row
      userPrefsTable.push({ user_id: 'u1', primary_currency: 'INR', tz: 'Asia/Kolkata', updated_at: '2026-06-17T00:00:00Z' })
      const res = await PUT(new Request('http://x/api/user-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ primary_currency: 'EUR', tz: 'Europe/Berlin' }),
      }))
      expect(res.status).toBe(200)
      expect(userPrefsTable).toHaveLength(1)
      expect(userPrefsTable[0].primary_currency).toBe('EUR')
      expect(userPrefsTable[0].tz).toBe('Europe/Berlin')
    })
  })
})
