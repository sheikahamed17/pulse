/* eslint-disable @typescript-eslint/no-explicit-any */
// The in-memory mock DB chain is generic; precise typing would be fixture-only
// noise. `any` is the right escape valve for a test double.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory tables the mock reads/writes. op_log is seeded per test; the
// materialized tables start empty and are populated by the backfill.
let tables: Record<string, Record<string, unknown>[]>

function resetTables() {
  tables = {
    op_log: [], categories: [], money_entries: [],
    recurring_rules: [], tasks: [], insights: [], widgets: [],
  }
}

class MockQuery {
  private wheres: Array<[string, unknown]> = []
  private orderCol: string | null = null
  constructor(private table: string) {}
  where(col: string, _op: string, val: unknown) { this.wheres.push([col, val]); return this }
  orderBy(col: string) { this.orderCol = col; return this }
  selectAll() { return this }
  private resolve() {
    let rows = [...(tables[this.table] ?? [])]
    for (const [c, v] of this.wheres) rows = rows.filter(r => r[c] === v)
    if (this.orderCol) {
      const c = this.orderCol
      rows = rows.sort((a, b) => String(a[c]).localeCompare(String(b[c])))
    }
    return rows
  }
  async execute() { return this.resolve() }
  async executeTakeFirst() { return this.resolve()[0] }
}

const mockDb = {
  selectFrom: (t: string) => new MockQuery(t),
  insertInto: (t: string) => ({
    values: (row: Record<string, unknown>) => ({
      onConflict: (fn: (oc: any) => any) => {
        const oc = {
          column: () => ({
            doUpdateSet: (upd: Record<string, unknown>) => ({
              async execute() {
                const tbl = (tables[t] ??= [])
                const i = tbl.findIndex(r => r.id === row.id)
                if (i >= 0) tbl[i] = { ...tbl[i], ...upd }
                else tbl.push(row)
              },
            }),
          }),
        }
        return fn(oc)
      },
    }),
  }),
}

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null } }) }))
vi.mock('@/lib/db', () => ({ createDb: () => mockDb }))
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }))

const { POST } = await import('@/app/api/admin/backfill/route')

function opRow(o: {
  id: string; hlc: string; user_id: string
  entity_kind: string; entity_id: string; payload: Record<string, unknown>
}) {
  return {
    id: o.id, hlc: o.hlc, device_id: 'd1', user_id: o.user_id,
    entity_kind: o.entity_kind, entity_id: o.entity_id, op_type: 'create',
    payload: JSON.stringify(o.payload), schema_version: 1,
  }
}

const call = () => POST(new Request('http://x/api/admin/backfill', { method: 'POST' }))

describe('/api/admin/backfill', () => {
  beforeEach(async () => {
    resetTables()
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('rejects without a session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null as never)
    const res = await call()
    expect(res.status).toBe(401)
  })

  it('replays op_log in HLC order so a category materializes before the money entry that references it', async () => {
    tables.op_log.push(
      opRow({ id: 'op-cat', hlc: '0000000000000001-000000-d1', user_id: 'u1',
        entity_kind: 'category', entity_id: 'cat-food',
        payload: { name: 'Food', kind: 'spend', sort_order: 0 } }),
      opRow({ id: 'op-money', hlc: '0000000000000002-000000-d1', user_id: 'u1',
        entity_kind: 'money', entity_id: 'm1',
        payload: { amount: 8000, currency: 'INR', direction: 'out',
          occurred_at: '2026-07-01T00:00:00.000Z', source: 'manual', category_id: 'cat-food' } }),
    )

    const res = await call()
    const body = await res.json() as any
    expect(res.status).toBe(200)
    expect(body.materialized).toBe(2)
    expect(body.by_kind).toEqual({ category: 1, money: 1 })
    expect(body.errors).toEqual([])
    // Category row exists (so the money entry's category_id FK would resolve).
    expect(tables.categories.map(c => c.id)).toEqual(['cat-food'])
    expect(tables.money_entries).toHaveLength(1)
    expect(tables.money_entries[0].category_id).toBe('cat-food')
    // is_archived was omitted from the op → not written as an explicit NULL.
    expect(tables.categories[0].is_archived).not.toBeNull()
  })

  it('only backfills the calling user\'s ops', async () => {
    tables.op_log.push(
      opRow({ id: 'op-mine', hlc: '0000000000000001-000000-d1', user_id: 'u1',
        entity_kind: 'category', entity_id: 'c1', payload: { name: 'Mine', kind: 'spend', sort_order: 0 } }),
      opRow({ id: 'op-other', hlc: '0000000000000002-000000-d2', user_id: 'u2',
        entity_kind: 'category', entity_id: 'c2', payload: { name: 'Other', kind: 'spend', sort_order: 0 } }),
    )

    const res = await call()
    const body = await res.json() as any
    expect(body.total_ops).toBe(1)
    expect(body.materialized).toBe(1)
    expect(tables.categories.map(c => c.id)).toEqual(['c1'])
  })
})
