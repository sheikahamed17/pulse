import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeR2 = {
  get: vi.fn(),
}

const mockEnv: { RECEIPTS?: typeof fakeR2 } = { RECEIPTS: fakeR2 }

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: mockEnv }),
}))

// Proven mock pattern (mirrors tests/api/receipt-route.test.ts): a vi.fn()
// with a default resolved session; individual tests override per-call with
// mockResolvedValueOnce. `vi.clearAllMocks()` clears call records but keeps
// the mockResolvedValue default, so the logged-in session persists per test.
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'user123' } }),
}))

const { GET } = await import('@/app/api/receipt/[...key]/route')

describe('/api/receipt/[...key]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null as never)
    const res = await GET(new Request('http://x/api/receipt/user123/abc.jpg'), {
      params: Promise.resolve({ key: ['user123', 'abc.jpg'] }),
    } as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 if key does not start with user id', async () => {
    const res = await GET(new Request('http://x/api/receipt/attacker/abc.jpg'), {
      params: Promise.resolve({ key: ['attacker', 'abc.jpg'] }),
    } as never)
    expect(res.status).toBe(403)
  })

  it('returns 404 if R2 object not found', async () => {
    fakeR2.get.mockResolvedValueOnce(null)
    const res = await GET(new Request('http://x/api/receipt/user123/abc.jpg'), {
      params: Promise.resolve({ key: ['user123', 'abc.jpg'] }),
    } as never)
    expect(res.status).toBe(404)
  })

  it('returns 200 with object when found', async () => {
    const mockObj = {
      body: new Blob(['jpeg'], { type: 'image/jpeg' }),
      httpMetadata: { contentType: 'image/jpeg' },
    }
    fakeR2.get.mockResolvedValueOnce(mockObj)

    const res = await GET(new Request('http://x/api/receipt/user123/abc.jpg'), {
      params: Promise.resolve({ key: ['user123', 'abc.jpg'] }),
    } as never)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('private')
  })

  it('joins multi-part keys with slash', async () => {
    const mockObj = {
      body: new Blob(['x']),
      httpMetadata: { contentType: 'image/jpeg' },
    }
    fakeR2.get.mockResolvedValueOnce(mockObj)

    await GET(new Request('http://x/api/receipt/user123/uuid/nested.jpg'), {
      params: Promise.resolve({ key: ['user123', 'uuid', 'nested.jpg'] }),
    } as never)

    expect(fakeR2.get).toHaveBeenCalledWith('user123/uuid/nested.jpg')
  })

  it('returns 500 when R2 is not configured', async () => {
    const originalReceipts = mockEnv.RECEIPTS
    try {
      mockEnv.RECEIPTS = undefined
      const res = await GET(new Request('http://x/api/receipt/user123/abc.jpg'), {
        params: Promise.resolve({ key: ['user123', 'abc.jpg'] }),
      } as never)
      expect(res.status).toBe(500)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('r2_not_configured')
    } finally {
      mockEnv.RECEIPTS = originalReceipts
    }
  })
})
