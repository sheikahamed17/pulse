import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { OpSchema, type Op } from '@/types/ops'
import { filterNewOps, orderOpsAfter } from '@/lib/sync-server'
import { materializeRow } from '@/lib/materialize'

const RequestSchema = z.object({
  device_id: z.string().min(1),
  last_synced_hlc: z.string().optional(),
  new_ops: z.array(OpSchema),
})

// Do NOT use `runtime = 'edge'` — OpenNext makes the entire Worker the
// Workers runtime regardless; adding the directive doubles the wrapper and
// breaks `default` resolution.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { last_synced_hlc, new_ops } = parsed.data

  // Authorization: every op must claim this user
  for (const op of new_ops) {
    if (op.user_id !== userId) {
      return NextResponse.json({ error: 'op.user_id mismatch' }, { status: 403 })
    }
  }

  try {
  const { env } = getCloudflareContext()
  const d1 = (env as { DB: D1Database }).DB
  const db = createDb(d1)

  type OpLogRow = { id: string; hlc: string; device_id: string; user_id: string; entity_kind: string; entity_id: string; op_type: string; payload: string; schema_version: number }

  const rowToOp = (row: OpLogRow): Op => ({
    id: row.id, hlc: row.hlc, device_id: row.device_id, user_id: row.user_id,
    entity_kind: row.entity_kind as Op['entity_kind'], entity_id: row.entity_id,
    op_type: row.op_type as Op['op_type'],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    schema_version: row.schema_version,
  })

  // 1. Dedup incoming by id (bounded by |new_ops|).
  let existingIncomingIds = new Set<string>()
  if (new_ops.length > 0) {
    const rows = await db.selectFrom('op_log')
      .where('user_id', '=', userId)
      .where('id', 'in', new_ops.map(o => o.id))
      .select('id')
      .execute()
    existingIncomingIds = new Set(rows.map(r => r.id))
  }
  const newOps = filterNewOps(new_ops, existingIncomingIds)

  // 2. Persist + materialize each genuinely-new op (bounded by |newOps|).
  //    op_log is the source of truth; a materialize (projection) failure is
  //    logged, not fatal — one bad op must never re-wedge sync.
  for (const op of newOps) {
    await db.insertInto('op_log').values({
      id: op.id, user_id: op.user_id, hlc: op.hlc, device_id: op.device_id,
      entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type,
      payload: JSON.stringify(op.payload), schema_version: op.schema_version, applied_at: Date.now(),
    }).onConflict(oc => oc.column('id').doNothing()).execute()
    try {
      await materializeRow(db, op, userId)
    } catch (err) {
      console.error('sync materialize failed', op.id, op.entity_kind, (err as Error).message)
    }
  }

  // 3. Pull the delta the client is missing (bounded by delta; no cursor = one-time bootstrap).
  let pull = db.selectFrom('op_log').where('user_id', '=', userId)
  if (last_synced_hlc) pull = pull.where('hlc', '>', last_synced_hlc)
  const deltaRows = await pull.orderBy('hlc', 'asc').selectAll().execute()
  const opsForClient = orderOpsAfter(deltaRows.map(rowToOp), last_synced_hlc)

  // 4. Cursor = max HLC (ORDER BY hlc DESC LIMIT 1 — index-backed, no aggregate).
  const maxRow = await db.selectFrom('op_log')
    .where('user_id', '=', userId)
    .orderBy('hlc', 'desc').limit(1)
    .select('hlc').executeTakeFirst()
  const serverHlc = maxRow?.hlc ?? '0000000000000000-000000-server'

  return NextResponse.json({
    server_hlc: serverHlc,
    new_ops_from_server: opsForClient,
    applied_ack: new_ops.map(o => o.id),
  })
  } catch (err) {
    // op_log is the source of truth and is written before this point per op; a
    // failure here (e.g. a transient D1 error) must be diagnosable rather than an
    // opaque 500. Log the full stack for `wrangler tail`, return a clean error.
    console.error('[sync] unhandled error:', (err as Error)?.stack ?? String(err))
    return NextResponse.json({ error: 'sync failed' }, { status: 500 })
  }
}
