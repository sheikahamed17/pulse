import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import type { Op } from '@/types/ops'
import { materializeRow } from '@/lib/materialize'

export const dynamic = 'force-dynamic'

// One-time, idempotent backfill: replays the caller's entire op_log into the
// server-side materialized tables in HLC order. Needed because prod D1 was
// unmigrated for months (0002/0003 never applied remote), so historical
// categories/recurring/money/tasks were never projected server-side — leaving
// money entries with dangling category_id foreign keys (SQLITE_CONSTRAINT on
// materialize). Ascending-HLC replay guarantees a category/recurring row lands
// before any money entry that references it. materializeRow upserts, so this is
// safe to run repeatedly. Session-scoped: it only touches the caller's own ops.
export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const rows = await db
    .selectFrom('op_log')
    .where('user_id', '=', userId)
    .orderBy('hlc', 'asc')
    .selectAll()
    .execute()

  const byKind: Record<string, number> = {}
  const errors: Array<{ op_id: string; entity_kind: string; error: string }> = []
  let materialized = 0

  for (const row of rows) {
    const op: Op = {
      id: row.id,
      hlc: row.hlc,
      device_id: row.device_id,
      user_id: row.user_id,
      entity_kind: row.entity_kind as Op['entity_kind'],
      entity_id: row.entity_id,
      op_type: row.op_type as Op['op_type'],
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      schema_version: row.schema_version,
    }
    try {
      await materializeRow(db, op, userId)
      materialized++
      byKind[op.entity_kind] = (byKind[op.entity_kind] ?? 0) + 1
    } catch (err) {
      errors.push({
        op_id: op.id,
        entity_kind: op.entity_kind,
        error: (err as Error).message,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    total_ops: rows.length,
    materialized,
    by_kind: byKind,
    errors,
  })
}
