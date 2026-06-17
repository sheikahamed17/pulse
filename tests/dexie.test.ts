import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'

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
      source: 'voice' as const, raw_input: 'spent 80 on chai',
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
        source: 'manual', raw_input: null, recurring_rule_id: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
      { id: 'b', user_id: 'u1', amount: 2, currency: 'INR', direction: 'out',
        category_id: null, description: null,
        occurred_at: '2026-06-15T00:00:00Z',
        source: 'manual', raw_input: null, recurring_rule_id: null,
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
