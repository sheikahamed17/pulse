/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
let opLog: Row[] = []
const materialized: string[] = []

function makeFakeDb() {
  return {
    selectFrom: () => {
      const conds: Array<[string, string, unknown]> = []
      let orderDir: 'asc' | 'desc' = 'asc'; let lim: number | null = null
      const b: any = {
        where: (c: string, o: string, v: unknown) => { conds.push([c, o, v]); return b },
        orderBy: (_c: string, d: 'asc' | 'desc' = 'asc') => { orderDir = d; return b },
        limit: (n: number) => { lim = n; return b },
        selectAll: () => b,
        execute: async () => {
          let rows = opLog.filter(r => conds.every(([c, o, v]) =>
            o === '=' ? r[c] === v : o === '>' ? String(r[c]) > String(v) : true))
          rows.sort((x, y) => String(x.hlc) < String(y.hlc) ? -1 : 1)
          if (orderDir === 'desc') rows.reverse()
          if (lim != null) rows = rows.slice(0, lim)
          return rows
        },
      }
      return b
    },
  } as any
}
let currentDb: any
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null } }) }))
vi.mock('@/lib/db', () => ({ createDb: () => currentDb }))
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/materialize', () => ({ materializeRow: vi.fn(async (_db: unknown, op: { id: string }) => { materialized.push(op.id) }) }))

const { POST } = await import('@/app/api/admin/backfill/route')

function req(body: unknown) {
  return new Request('http://x/api/admin/backfill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
function mkRow(id: string, hlc: string): Row {
  return { id, hlc, device_id: 'd1', user_id: 'u1', entity_kind: 'money', entity_id: id, op_type: 'create', payload: '{}', schema_version: 1 }
}

describe('POST /api/admin/backfill (chunked)', () => {
  beforeEach(() => {
    opLog = [mkRow('a', '0000000000000001-000000-d1'), mkRow('b', '0000000000000002-000000-d1'), mkRow('c', '0000000000000003-000000-d1')]
    materialized.length = 0
    currentDb = makeFakeDb()
  })

  it('processes at most `limit` ops and reports next_after + not-done', async () => {
    const res = await POST(req({ limit: 2 }))
    const body = await res.json() as { processed: number; next_after: string; done: boolean }
    expect(body.processed).toBe(2)
    expect(body.next_after).toBe('0000000000000002-000000-d1')
    expect(body.done).toBe(false)
    expect(materialized).toEqual(['a', 'b'])
  })

  it('continues after a cursor and reports done on the last page', async () => {
    const res = await POST(req({ after: '0000000000000002-000000-d1', limit: 2 }))
    const body = await res.json() as { processed: number; done: boolean }
    expect(body.processed).toBe(1)
    expect(body.done).toBe(true)
    expect(materialized).toEqual(['c'])
  })
})
