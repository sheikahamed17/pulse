import { describe, it, expect, vi, beforeEach } from 'vitest'

const sampleRates = [
  { date: '2026-06-18', base: 'EUR', target: 'USD', rate: 1.08 },
  { date: '2026-06-17', base: 'EUR', target: 'USD', rate: 1.07 },
  { date: '2026-06-18', base: 'EUR', target: 'INR', rate: 90.5 },
]

const fakeDb = {
  selectFrom: (_table: string) => ({
    where: (_col1: string, _op1: string, _val1: unknown) => ({
      where: (_col2: string, _op2: string, val2: string[]) => ({
        orderBy: () => ({
          selectAll: () => ({
            execute: async () => sampleRates.filter(r => val2.includes(r.target)),
          }),
        }),
      }),
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

const { GET } = await import('@/app/api/fx/rates/route')

describe('/api/fx/rates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns rates for requested targets', async () => {
    const res = await GET(new Request('http://x/api/fx/rates?since=2026-06-01&targets=USD,INR'))
    expect(res.status).toBe(200)
    const body = await res.json() as { rates: Array<{ target: string }> }
    expect(body.rates.length).toBe(3)                       // 2 USD + 1 INR sample row
    const targets = new Set(body.rates.map(r => r.target))
    expect(targets.has('USD')).toBe(true)
    expect(targets.has('INR')).toBe(true)
  })

  it('returns 400 on missing targets param', async () => {
    const res = await GET(new Request('http://x/api/fx/rates?since=2026-06-01'))
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid since', async () => {
    const res = await GET(new Request('http://x/api/fx/rates?since=last-week&targets=USD'))
    expect(res.status).toBe(400)
  })

  it('returns 401 without session', async () => {
    const { getSession } = await import('@/lib/auth')
    ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await GET(new Request('http://x/api/fx/rates?since=2026-06-01&targets=USD'))
    expect(res.status).toBe(401)
  })

  it('sends a Cache-Control header for client-side caching', async () => {
    const res = await GET(new Request('http://x/api/fx/rates?since=2026-06-01&targets=USD'))
    const cc = res.headers.get('cache-control')
    expect(cc).toMatch(/max-age/)
  })
})
