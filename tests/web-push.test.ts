import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { generateKeyPair, exportJWK, base64url } from 'jose'
import { buildVapidAuthHeader, sendWakeUpPush, sendPushToUser } from '@/lib/web-push'

let TEST_ENV: { VAPID_PRIVATE_KEY: string; VAPID_PUBLIC_KEY: string }

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { crv: 'P-256', extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const privateJwk = await exportJWK(privateKey)
  const xBytes = base64url.decode(publicJwk.x!)
  const yBytes = base64url.decode(publicJwk.y!)
  const uncompressed = new Uint8Array(1 + xBytes.length + yBytes.length)
  uncompressed[0] = 0x04
  uncompressed.set(xBytes, 1)
  uncompressed.set(yBytes, 1 + xBytes.length)
  TEST_ENV = {
    VAPID_PRIVATE_KEY: JSON.stringify(privateJwk),
    VAPID_PUBLIC_KEY: base64url.encode(uncompressed),
  }
})

describe('web-push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildVapidAuthHeader', () => {
    it('builds a valid vapid header with t and k values', async () => {
      const endpoint = 'https://push.example.com/v1/send/abc123'
      const header = await buildVapidAuthHeader(endpoint, TEST_ENV)

      expect(header).toMatch(/^vapid t=.+, k=.+$/)
      const tMatch = header.match(/t=([^,]+)/)
      const kMatch = header.match(/k=(.+)$/)
      expect(tMatch?.[1]).toBeTruthy()
      expect(tMatch![1].startsWith('eyJ')).toBe(true) // JWT starts with eyJ in base64
      expect(kMatch?.[1]).toBe(TEST_ENV.VAPID_PUBLIC_KEY)
    })

    it('throws if VAPID_PRIVATE_KEY is missing', async () => {
      const env = { VAPID_PRIVATE_KEY: undefined, VAPID_PUBLIC_KEY: TEST_ENV.VAPID_PUBLIC_KEY }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(buildVapidAuthHeader('https://example.com', env as any)).rejects.toThrow()
    })

    it('throws if VAPID_PUBLIC_KEY is missing', async () => {
      const env = { VAPID_PRIVATE_KEY: TEST_ENV.VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY: undefined }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(buildVapidAuthHeader('https://example.com', env as any)).rejects.toThrow()
    })

    it('encodes JWT claims: aud, sub, exp', async () => {
      // Decode and verify the JWT structure (basic check; full verification in integration)
      const header = await buildVapidAuthHeader('https://push.example.com/send', TEST_ENV)
      const jwtPart = header.match(/t=([^,]+)/)?.[1]
      expect(jwtPart).toBeTruthy()
      // A valid JWT has three dot-separated parts
      expect((jwtPart as string).split('.').length).toBe(3)
    })

    it('decodes JWT to verify aud, sub, exp claims (JOSE structure)', async () => {
      const endpoint = 'https://push.example.com/v1/send/xyz'
      const header = await buildVapidAuthHeader(endpoint, TEST_ENV)
      const jwtPart = header.match(/t=([^,]+)/)?.[1] as string

      // Decode JWT manually: split parts and decode base64url payload (second part)
      const parts = jwtPart.split('.')
      expect(parts).toHaveLength(3)

      // Decode payload (second part) from base64url
      const base64url = parts[1]
      const decoded = JSON.parse(
        Buffer.from(
          base64url.replace(/-/g, '+').replace(/_/g, '/'),
          'base64',
        ).toString('utf-8'),
      ) as { aud: string; sub: string; exp: number }

      // Verify RFC 8291 claims
      expect(decoded.aud).toBe('https://push.example.com') // audience is endpoint origin
      expect(decoded.sub).toBe('mailto:sdsheikahamed@gmail.com')
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000)) // expiration in future
      expect(decoded.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 12 * 3600 + 10) // within 12h + 10s tolerance
    })
  })

  describe('sendWakeUpPush', () => {
    it('returns ok on 2xx response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 201 }))

      const result = await sendWakeUpPush({ endpoint: 'https://push.example.com/v1/send/abc' }, TEST_ENV)
      expect(result).toBe('ok')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://push.example.com/v1/send/abc',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            ttl: '86400',
          }),
        }),
      )
    })

    it('returns gone on 404', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
      const result = await sendWakeUpPush({ endpoint: 'https://push.example.com/gone' }, TEST_ENV)
      expect(result).toBe('gone')
    })

    it('returns gone on 410', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 410 }))
      const result = await sendWakeUpPush({ endpoint: 'https://push.example.com/gone' }, TEST_ENV)
      expect(result).toBe('gone')
    })

    it('returns failed on 5xx error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      const result = await sendWakeUpPush({ endpoint: 'https://push.example.com/error' }, TEST_ENV)
      expect(result).toBe('failed')
    })

    it('returns failed on network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))
      const result = await sendWakeUpPush({ endpoint: 'https://invalid' }, TEST_ENV)
      expect(result).toBe('failed')
    })
  })

  describe('sendPushToUser', () => {
    it('sends to all subscriptions and returns counts', async () => {
      const subs = [
        { id: 'sub1', user_id: 'user1', endpoint: 'https://p1', p256dh: 'key1', auth: 'auth1', failed_count: 0, created_at: '2026-01-01T00:00:00Z' },
        { id: 'sub2', user_id: 'user1', endpoint: 'https://p2', p256dh: 'key2', auth: 'auth2', failed_count: 0, created_at: '2026-01-01T00:00:00Z' },
      ]

      const updates: Array<{ id: string; failed_count: number }> = []
      const deletes: string[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeDb: any = {
        selectFrom: () => ({
          where: () => ({
            selectAll: () => ({
              execute: async () => subs,
            }),
          }),
        }),
        updateTable: () => ({
          set: (vals: { failed_count: number }) => ({
            where: () => ({
              execute: async () => { updates.push({ id: 'unknown', failed_count: vals.failed_count }) },
            }),
          }),
        }),
        deleteFrom: () => ({
          where: () => ({
            execute: async () => { deletes.push('deleted') },
          }),
        }),
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 201 })) // sub1 ok
        .mockResolvedValueOnce(new Response('', { status: 201 })) // sub2 ok

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sendPushToUser(fakeDb as unknown as any, TEST_ENV, 'user1')
      expect(result.sent).toBe(2)
      expect(result.pruned).toBe(0)
    })

    it('deletes subscriptions on gone response', async () => {
      const subs = [
        { id: 'sub1', user_id: 'user1', endpoint: 'https://p1', p256dh: 'key1', auth: 'auth1', failed_count: 0, created_at: '2026-01-01T00:00:00Z' },
      ]

      const deletes: string[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeDb: any = {
        selectFrom: () => ({
          where: () => ({
            selectAll: () => ({
              execute: async () => subs,
            }),
          }),
        }),
        deleteFrom: () => ({
          where: () => ({
            execute: async () => { deletes.push('deleted') },
          }),
        }),
        updateTable: () => ({
          set: () => ({
            where: () => ({
              execute: async () => {},
            }),
          }),
        }),
      }

      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 410 }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sendPushToUser(fakeDb as unknown as any, TEST_ENV, 'user1')
      expect(result.pruned).toBe(1)
      expect(result.sent).toBe(0)
      expect(deletes.length).toBe(1)
    })

    it('deletes subscriptions after 5 consecutive failures', async () => {
      const subs = [
        { id: 'sub1', user_id: 'user1', endpoint: 'https://p1', p256dh: 'key1', auth: 'auth1', failed_count: 4, created_at: '2026-01-01T00:00:00Z' },
      ]

      const deletes: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeDb: any = {
        selectFrom: () => ({
          where: () => ({
            selectAll: () => ({
              execute: async () => subs,
            }),
          }),
        }),
        deleteFrom: () => ({
          where: () => ({
            execute: async () => { deletes.push('deleted') },
          }),
        }),
        updateTable: () => ({
          set: (vals: { failed_count: number }) => ({
            where: () => ({
              execute: async () => { updates.push(vals) },
            }),
          }),
        }),
      }

      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sendPushToUser(fakeDb as unknown as any, TEST_ENV, 'user1')
      expect(result.pruned).toBe(1) // Deleted at 5th failure
      expect(deletes.length).toBe(1)
    })

    it('increments failed_count on intermediate failures', async () => {
      const subs = [
        { id: 'sub1', user_id: 'user1', endpoint: 'https://p1', p256dh: 'key1', auth: 'auth1', failed_count: 2, created_at: '2026-01-01T00:00:00Z' },
      ]

      const deletes: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeDb: any = {
        selectFrom: () => ({
          where: () => ({
            selectAll: () => ({
              execute: async () => subs,
            }),
          }),
        }),
        deleteFrom: () => ({
          where: () => ({
            execute: async () => { deletes.push('deleted') },
          }),
        }),
        updateTable: () => ({
          set: (vals: { failed_count: number }) => ({
            where: () => ({
              execute: async () => { updates.push(vals) },
            }),
          }),
        }),
      }

      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sendPushToUser(fakeDb as unknown as any, TEST_ENV, 'user1')
      expect(result.pruned).toBe(0) // Not deleted; failed_count < 5
      expect(result.sent).toBe(0)
      expect(updates.length).toBe(1)
      expect(updates[0].failed_count).toBe(3) // 2 + 1
      expect(deletes.length).toBe(0)
    })
  })
})
