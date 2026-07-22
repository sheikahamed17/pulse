import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb, type InsightRow, type ReceiptQueueItem } from '@/lib/dexie'

describe('Dexie schema v2', () => {
  beforeEach(async () => { await resetDb() })

  it('exposes the Phase 1 stores', () => {
    expect(db.money_entries).toBeDefined()
    expect(db.recurring_rules).toBeDefined()
    expect(db.categories).toBeDefined()
  })

  it('round-trips a money_entries row', async () => {
    const row = {
      id: 'm1', user_id: 'u1',
      amount: 8000, currency: 'INR', direction: 'out' as const,
      category_id: 'c1', description: 'chai',
      occurred_at: '2026-06-18T14:30:00Z',
      source: 'voice' as const, receipt_key: null, raw_input: 'spent 80 on chai',
      recurring_rule_id: null,
      field_hlcs: { amount: '0000000000000001-000000-d1' },
      deleted_at: null,
      created_at: '2026-06-18T14:30:00Z',
      updated_at: '2026-06-18T14:30:00Z',
    }
    await db.money_entries.put(row)
    const back = await db.money_entries.get('m1')
    expect(back?.amount).toBe(8000)
    expect(back?.description).toBe('chai')
  })

  it('compound index [user_id+occurred_at] supports range queries', async () => {
    await db.money_entries.bulkPut([
      { id: 'a', user_id: 'u1', amount: 1, currency: 'INR', direction: 'out',
        category_id: null, description: null,
        occurred_at: '2026-06-01T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
      { id: 'b', user_id: 'u1', amount: 2, currency: 'INR', direction: 'out',
        category_id: null, description: null,
        occurred_at: '2026-06-15T00:00:00Z',
        source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' },
    ])
    const rows = await db.money_entries
      .where('[user_id+occurred_at]')
      .between(['u1', '2026-06-10T00:00:00Z'], ['u1', '2026-06-30T00:00:00Z'])
      .toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('b')
  })

  it('voice_queue from Phase 0 still works', async () => {
    await db.voice_queue.put({
      id: 'v1', blob: new Blob(['x']),
      created_at: '2026-06-18T14:30:00Z',
      retry_count: 0, status: 'queued',
    })
    expect(await db.voice_queue.count()).toBe(1)
  })
})

describe('Dexie schema v3 — Phase 2', () => {
  beforeEach(async () => { await resetDb() })

  it('exposes the Phase 2 stores', () => {
    expect(db.tasks).toBeDefined()
    expect(db.fx_rates).toBeDefined()
  })

  it('round-trips a tasks row', async () => {
    const row = {
      id: 't1', user_id: 'u1',
      title: 'call mom',
      due_at: '2026-06-19T15:00:00.000Z',
      priority: 'medium' as const,
      completed_at: null,
      source: 'voice' as const, raw_input: 'remind me to call mom tomorrow at 3',
      recur_period: null, recur_interval: null,
      field_hlcs: { title: '0000000000000001-000000-d1' },
      deleted_at: null,
      created_at: '2026-06-18T14:30:00.000Z',
      updated_at: '2026-06-18T14:30:00.000Z',
    }
    await db.tasks.put(row)
    const back = await db.tasks.get('t1')
    expect(back?.title).toBe('call mom')
    expect(back?.priority).toBe('medium')
  })

  it('compound index [user_id+due_at] supports range queries on open tasks', async () => {
    await db.tasks.bulkPut([
      { id: 'a', user_id: 'u1', title: 'a', due_at: '2026-06-19T00:00:00.000Z',
        priority: 'medium', completed_at: null, source: 'manual', raw_input: null,
        recur_period: null, recur_interval: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-18T00:00:00.000Z', updated_at: '2026-06-18T00:00:00.000Z' },
      { id: 'b', user_id: 'u1', title: 'b', due_at: '2026-06-25T00:00:00.000Z',
        priority: 'high', completed_at: null, source: 'manual', raw_input: null,
        recur_period: null, recur_interval: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-18T00:00:00.000Z', updated_at: '2026-06-18T00:00:00.000Z' },
    ])
    const rows = await db.tasks
      .where('[user_id+due_at]')
      .between(['u1', '2026-06-20T00:00:00.000Z'], ['u1', '2026-06-30T00:00:00.000Z'])
      .toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('b')
  })

  it('round-trips an fx_rates row', async () => {
    await db.fx_rates.put({ date: '2026-06-18', base: 'EUR', target: 'USD', rate: 1.08 })
    const all = await db.fx_rates.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].rate).toBe(1.08)
  })

  it('Phase 0/1 stores from v1+v2 still work after v3 bump', async () => {
    await db.widgets.put({
      id: 'w1', user_id: 'u1', label: 'still works',
      field_hlcs: {}, deleted_at: null,
      created_at: '2026-06-18T00:00:00.000Z', updated_at: '2026-06-18T00:00:00.000Z',
    })
    expect(await db.widgets.count()).toBe(1)
    await db.money_entries.put({
      id: 'm1', user_id: 'u1',
      amount: 100, currency: 'INR', direction: 'out',
      category_id: null, description: null,
      occurred_at: '2026-06-18T00:00:00.000Z',
      source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
      field_hlcs: {}, deleted_at: null,
      created_at: '2026-06-18T00:00:00.000Z', updated_at: '2026-06-18T00:00:00.000Z',
    })
    expect(await db.money_entries.count()).toBe(1)
  })
})

describe('Dexie v4: insights + receipt_queue — Phase 3', () => {
  beforeEach(async () => { await resetDb() })

  it('exposes the Phase 3 stores', () => {
    expect(db.insights).toBeDefined()
    expect(db.receipt_queue).toBeDefined()
  })

  it('compound index [user_id+starts_at] on insights supports range queries', async () => {
    const insight1: InsightRow = {
      id: 'insight-1',
      user_id: 'u1',
      period: 'weekly',
      starts_at: '2026-06-14T18:30:00.000Z',
      ends_at: '2026-06-21T18:30:00.000Z',
      summary: 'Week 1',
      metrics: JSON.stringify({ spend: 1000 }),
      field_hlcs: { summary: '1' },
      deleted_at: null,
      created_at: '2026-06-21T12:00:00.000Z',
      updated_at: '2026-06-21T12:00:00.000Z',
    }
    const insight2: InsightRow = {
      id: 'insight-2',
      user_id: 'u1',
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'Week 2',
      metrics: JSON.stringify({ spend: 1500 }),
      field_hlcs: { summary: '2' },
      deleted_at: null,
      created_at: '2026-06-28T12:00:00.000Z',
      updated_at: '2026-06-28T12:00:00.000Z',
    }
    await db.insights.bulkPut([insight1, insight2])
    const rows = await db.insights
      .where('[user_id+starts_at]')
      .between(['u1', '2026-06-20T00:00:00.000Z'], ['u1', '2026-06-30T00:00:00.000Z'])
      .toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('insight-2')
  })

  it('can insert and retrieve InsightRow', async () => {
    const insight: InsightRow = {
      id: 'insight-1',
      user_id: 'user-1',
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'Great week!',
      metrics: JSON.stringify({ spend_total: 5000 }),
      field_hlcs: { summary: '1-summary', metrics: '1-metrics' },
      deleted_at: null,
      created_at: '2026-06-28T12:00:00.000Z',
      updated_at: '2026-06-28T12:00:00.000Z',
    }
    await db.insights.put(insight)
    const retrieved = await db.insights.get('insight-1')
    expect(retrieved).toEqual(insight)
  })

  it('can insert and retrieve ReceiptQueueItem', async () => {
    const blob = new Blob(['test'], { type: 'image/jpeg' })
    const item: ReceiptQueueItem = {
      id: 'receipt-1',
      blob,
      created_at: '2026-06-28T12:00:00.000Z',
      retry_count: 0,
      status: 'queued',
    }
    await db.receipt_queue.put(item as never)
    const retrieved = await db.receipt_queue.get('receipt-1') as unknown as ReceiptQueueItem | undefined
    expect(retrieved?.id).toBe('receipt-1')
    expect(retrieved?.status).toBe('queued')
  })

  it('resetDb clears insights and receipt_queue', async () => {
    await db.insights.put({
      id: 'i1',
      user_id: 'u1',
      period: 'weekly',
      starts_at: '2026-06-21T18:30:00.000Z',
      ends_at: '2026-06-28T18:30:00.000Z',
      summary: 'test',
      metrics: '{}',
      field_hlcs: {},
      deleted_at: null,
      created_at: '2026-06-28T12:00:00.000Z',
      updated_at: '2026-06-28T12:00:00.000Z',
    })
    await resetDb()
    const count = await db.insights.count()
    expect(count).toBe(0)
  })
})
