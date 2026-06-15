import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { OpSchema, type Op } from '@/types/ops'
import { mergeOpsForUser } from '@/lib/sync-server'
import { applyOp } from '@/lib/op-log'

const RequestSchema = z.object({
  device_id: z.string().min(1),
  last_synced_hlc: z.string().optional(),
  new_ops: z.array(OpSchema),
})

export const runtime = 'edge'  // run in Workers runtime so D1 binding is available

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
  const { device_id, last_synced_hlc, new_ops } = parsed.data

  // Authorization: every op must claim this user
  for (const op of new_ops) {
    if (op.user_id !== userId) {
      return NextResponse.json({ error: 'op.user_id mismatch' }, { status: 403 })
    }
  }

  const { env } = getCloudflareContext()
  const d1 = (env as { DB: D1Database }).DB
  const db = createDb(d1)

  // Pull all existing ops for this user (full table for Phase 0 — we'll add pagination + checkpointing in Phase 2)
  const rows = await db
    .selectFrom('op_log')
    .where('user_id', '=', userId)
    .selectAll()
    .execute()

  const existingOps: Op[] = rows.map(row => ({
    id: row.id,
    hlc: row.hlc,
    device_id: row.device_id,
    user_id: row.user_id,
    entity_kind: row.entity_kind as Op['entity_kind'],
    entity_id: row.entity_id,
    op_type: row.op_type as Op['op_type'],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    schema_version: row.schema_version,
  }))

  const { newOps, opsForClient } = mergeOpsForUser(existingOps, new_ops, last_synced_hlc)

  // Persist new ops + materialize widgets
  for (const op of newOps) {
    await db
      .insertInto('op_log')
      .values({
        id: op.id,
        user_id: op.user_id,
        hlc: op.hlc,
        device_id: op.device_id,
        entity_kind: op.entity_kind,
        entity_id: op.entity_id,
        op_type: op.op_type,
        payload: JSON.stringify(op.payload),
        schema_version: op.schema_version,
        applied_at: Date.now(),
      })
      .execute()

    if (op.entity_kind === 'widget') {
      const existing = await db
        .selectFrom('widgets')
        .where('id', '=', op.entity_id)
        .where('user_id', '=', userId)
        .selectAll()
        .executeTakeFirst()

      const existingRow = existing
        ? {
            id: existing.id,
            user_id: existing.user_id,
            field_hlcs: JSON.parse(existing.field_hlcs) as Record<string, string>,
            deleted_at: existing.deleted_at,
            created_at: existing.created_at,
            updated_at: existing.updated_at,
            label: existing.label,
          }
        : undefined

      const merged = applyOp(existingRow as never, op)

      const row = {
        id: op.entity_id,
        user_id: userId,
        label: (merged.label as string | null) ?? null,
        field_hlcs: JSON.stringify(merged.field_hlcs),
        deleted_at: merged.deleted_at,
        created_at: merged.created_at,
        updated_at: merged.updated_at,
      }

      // Upsert. SQLite supports INSERT ... ON CONFLICT, exposed via Kysely's onConflict().
      await db
        .insertInto('widgets')
        .values(row)
        .onConflict(oc => oc.column('id').doUpdateSet({
          label: row.label,
          field_hlcs: row.field_hlcs,
          deleted_at: row.deleted_at,
          updated_at: row.updated_at,
        }))
        .execute()
    }
  }

  // Compute server HLC = max of all known op HLCs (lexicographic on serialized form works)
  const allHlcs = [...existingOps, ...newOps].map(o => o.hlc)
  const serverHlc = allHlcs.length > 0 ? allHlcs.sort()[allHlcs.length - 1] : '0000000000000000-000000-server'

  return NextResponse.json({
    server_hlc: serverHlc,
    new_ops_from_server: opsForClient,
    applied_ack: new_ops.map(o => o.id),
  })
}
