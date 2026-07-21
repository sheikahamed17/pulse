/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const aggregateWeek = vi.fn()
const writeDigestNarrative = vi.fn()
const fallbackSummary = vi.fn(() => 'FALLBACK')
const materializeRow = vi.fn()
vi.mock('@/lib/digest-aggregate', () => ({ aggregateWeek }))
vi.mock('@/lib/agents/digest-agent', () => ({ writeDigestNarrative, fallbackSummary }))
vi.mock('@/lib/materialize', () => ({ materializeRow }))

const opInserts: any[] = []
const fakeDb = {
  insertInto: () => ({ values: (v: any) => ({ execute: async () => { opInserts.push(v) } }) }),
  selectFrom: () => ({ where: function () { return this }, selectAll: function () { return this }, select: function () { return this }, executeTakeFirst: async () => ({ id: 'insight-u1-2026-07-19', summary: 'S', metrics: '{}' }) }),
} as any

const { generateInsight } = await import('@/lib/insight-generate')

const metrics = { currency: 'INR', spend_total: 100, income_total: 0, top_categories: [], tasks_completed: 0, tasks_created: 1, tasks_overdue: 0, skipped_currencies: [], entry_count: 3 }
const baseArgs = () => ({ db: fakeDb, groq: {} as any, userId: 'u1', bounds: { startsAt: '2026-07-19T18:30:00.000Z', endsAt: '2026-07-22T06:00:00.000Z' }, primaryCurrency: 'INR', nowIso: '2026-07-22T06:00:00.000Z', opId: 'insight-ondemand-u1-2026-07-19-123', opType: 'create' as const })

describe('generateInsight', () => {
  beforeEach(() => { vi.clearAllMocks(); opInserts.length = 0; fallbackSummary.mockReturnValue('FALLBACK') })

  it('skips an empty week (no op written)', async () => {
    aggregateWeek.mockResolvedValue({ ...metrics, entry_count: 0, tasks_created: 0, tasks_completed: 0 })
    const r = await generateInsight(baseArgs())
    expect(r.skipped).toBe(true)
    expect(opInserts).toHaveLength(0)
    expect(materializeRow).not.toHaveBeenCalled()
  })
  it('creates: writes an op_log row with the given opId + entity_id and materializes', async () => {
    aggregateWeek.mockResolvedValue(metrics)
    writeDigestNarrative.mockResolvedValue('NARRATIVE')
    const r = await generateInsight(baseArgs())
    expect(r.skipped).toBe(false)
    expect(opInserts).toHaveLength(1)
    expect(opInserts[0].id).toBe('insight-ondemand-u1-2026-07-19-123')
    expect(opInserts[0].entity_kind).toBe('insight')
    expect(opInserts[0].entity_id).toBe('insight-u1-2026-07-19')
    expect(opInserts[0].op_type).toBe('create')
    expect(materializeRow).toHaveBeenCalledOnce()
  })
  it('falls back to fallbackSummary when the narrative LLM throws', async () => {
    aggregateWeek.mockResolvedValue(metrics)
    writeDigestNarrative.mockRejectedValue(new Error('groq 429'))
    await generateInsight(baseArgs())
    const payload = JSON.parse(opInserts[0].payload)
    expect(payload.summary).toBe('FALLBACK')
  })
  it('uses fallbackSummary when groq is null (no LLM call)', async () => {
    aggregateWeek.mockResolvedValue(metrics)
    await generateInsight({ ...baseArgs(), groq: null })
    expect(writeDigestNarrative).not.toHaveBeenCalled()
    expect(JSON.parse(opInserts[0].payload).summary).toBe('FALLBACK')
  })
})
