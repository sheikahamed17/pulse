import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-06-18">
      <Cube currency="USD" rate="1.0823"/>
      <Cube currency="INR" rate="90.4715"/>
      <Cube currency="JPY" rate="171.42"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

const inserts: Array<{ table: string; values: unknown }> = []
const fakeDb = {
  insertInto: (table: string) => ({
    values: (values: unknown) => ({
      onConflict: () => ({
        execute: async () => { inserts.push({ table, values }) },
      }),
    }),
  }),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const fetchMock = vi.fn().mockResolvedValue({
  ok: true, text: async () => SAMPLE_XML,
})
global.fetch = fetchMock as unknown as typeof global.fetch

const { POST } = await import('@/app/api/cron/fx/route')

function cronReq(secret = TEST_SECRET) {
  return new Request('http://x/api/cron/fx', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('/api/cron/fx', () => {
  beforeEach(() => {
    inserts.length = 0
    fetchMock.mockClear().mockResolvedValue({ ok: true, text: async () => SAMPLE_XML })
  })

  it('rejects without auth', async () => {
    const res = await POST(new Request('http://x/api/cron/fx', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('rejects wrong bearer', async () => {
    const res = await POST(cronReq('wrong-secret-12345678901234567890abcd'))
    expect(res.status).toBe(403)
  })

  it('fetches ECB and upserts one row per currency', async () => {
    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { date: string; count: number }
    expect(body.date).toBe('2026-06-18')
    expect(body.count).toBe(3)
    expect(inserts).toHaveLength(3)
    const targets = inserts.map(i => (i.values as { target: string }).target).sort()
    expect(targets).toEqual(['INR', 'JPY', 'USD'])
  })

  it('returns 502 on ECB fetch failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' })
    const res = await POST(cronReq())
    expect(res.status).toBe(502)
  })

  it('returns 502 on XML parse failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '<bad/>' })
    const res = await POST(cronReq())
    expect(res.status).toBe(502)
  })
})
