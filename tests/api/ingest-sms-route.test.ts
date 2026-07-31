/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashSecret, makeIngestToken } from '@/lib/ingest-token'

type Row = Record<string, unknown>
let prefsRow: Row | null = null
const opLog: Row[] = []

function makeFakeDb() {
  return {
    selectFrom: (table: string) => {
      let idVal: unknown
      const b: any = {
        where: (_c: string, _o: string, v: unknown) => { idVal = v; return b },
        select: () => b,
        selectAll: () => b,
        executeTakeFirst: async () => {
          if (table === 'op_log') return opLog.find(o => o.id === idVal) ?? null
          if (table === 'user_prefs') return prefsRow
          return null
        },
      }
      return b
    },
    insertInto: () => ({ values: (v: Row) => ({ execute: async () => { opLog.push(v) } }) }),
  } as any
}

let currentFakeDb: any
const parseSmsMock = vi.fn()

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, GROQ_API_KEY: 'k' } }) }))
vi.mock('@/lib/db', () => ({ createDb: () => currentFakeDb }))
vi.mock('@/lib/agents/llm-client', () => ({ makeGroqClient: () => ({}) }))
vi.mock('@/lib/agents/sms-agent', () => ({ parseSms: (...a: unknown[]) => parseSmsMock(...a) }))
vi.mock('@/lib/materialize', () => ({ materializeRow: vi.fn(async () => {}) }))

const { POST } = await import('@/app/api/ingest/sms/route')

const U = 'user-1'
let goodToken = ''

function req(token: string, text: string) {
  return new Request('http://x/api/ingest/sms', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

describe('POST /api/ingest/sms', () => {
  beforeEach(async () => {
    opLog.length = 0
    parseSmsMock.mockReset()
    currentFakeDb = makeFakeDb()
    const { token, secret } = makeIngestToken(U)
    goodToken = token
    prefsRow = { user_id: U, primary_currency: 'INR', tz: 'Asia/Kolkata', sms_ingest_token_hash: await hashSecret(secret) }
  })

  it('rejects a bad token (403, no op)', async () => {
    const res = await POST(req('pulse_sms_user-1_wrongsecret', 'Rs.500 debited AMAZON'))
    expect(res.status).toBe(403)
    expect(opLog).toHaveLength(0)
  })

  it('creates one money op for a transaction', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const res = await POST(req(goodToken, 'Rs.500 debited AMAZON'))
    const body = await res.json() as { ok: boolean; added: boolean }
    expect(res.status).toBe(200)
    expect(body.added).toBe(true)
    expect(opLog).toHaveLength(1)
    expect(opLog[0].entity_kind).toBe('money')
    expect(String(opLog[0].entity_id).startsWith('sms-')).toBe(true)
  })

  it('skips a non-transaction (added:false, no op)', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: false })
    const res = await POST(req(goodToken, 'Your OTP is 1234'))
    const body = await res.json() as { added: boolean }
    expect(body.added).toBe(false)
    expect(opLog).toHaveLength(0)
  })
})
