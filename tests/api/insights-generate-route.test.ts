/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SESSION = { user: { id: 'u1', email: 't@x.com' } }
const generateInsight = vi.fn()
let existingRow: any = null
const fakeDb = {
  selectFrom: () => ({ where: function () { return this }, selectAll: function () { return this }, select: function () { return this }, executeTakeFirst: async () => existingRow }),
} as any

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, GROQ_API_KEY: 'k' } }) }))
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))
vi.mock('@/lib/agents/llm-client', () => ({ makeGroqClient: () => ({}) }))
vi.mock('@/lib/insight-generate', () => ({ generateInsight }))

const { POST } = await import('@/app/api/insights/generate/route')
const req = () => new Request('http://x/api/insights/generate', { method: 'POST' })

describe('/api/insights/generate', () => {
  beforeEach(async () => {
    vi.clearAllMocks(); existingRow = null
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValue(TEST_SESSION as any)
    generateInsight.mockResolvedValue({ skipped: false, insight: { id: 'insight-u1-2026-07-19', summary: 'S' } })
  })

  it('401 without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect((await POST(req())).status).toBe(401)
  })
  it('generates the current week (create when none exists)', async () => {
    const res = await POST(req())
    const body = await res.json() as { ok: boolean; insight: { id: string } }
    expect(body.ok).toBe(true)
    expect(generateInsight).toHaveBeenCalledWith(expect.objectContaining({ opType: 'create', userId: 'u1' }))
    expect(body.insight.id).toBe('insight-u1-2026-07-19')
  })
  it('refreshes (update op) when a row already exists', async () => {
    existingRow = { id: 'insight-u1-2026-07-19' }
    await POST(req())
    expect(generateInsight).toHaveBeenCalledWith(expect.objectContaining({ opType: 'update' }))
  })
  it('returns empty_week when the week has nothing', async () => {
    generateInsight.mockResolvedValueOnce({ skipped: true, insight: null })
    const body = await (await POST(req())).json() as { ok: boolean; reason: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('empty_week')
  })
})
