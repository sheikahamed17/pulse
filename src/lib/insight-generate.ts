import type Groq from 'groq-sdk'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'
import type { InsightRow } from '@/lib/dexie'
import type { Op } from '@/types/ops'
import { aggregateWeek } from '@/lib/digest-aggregate'
import { writeDigestNarrative, fallbackSummary } from '@/lib/agents/digest-agent'
import { materializeRow } from '@/lib/materialize'
import { serverHlcFor } from '@/lib/server-hlc'

export type GenerateInsightArgs = {
  db: Kysely<DB>
  groq: Groq | null
  userId: string
  bounds: { startsAt: string; endsAt: string }
  primaryCurrency: string
  nowIso: string
  opId: string
  opType: 'create' | 'update'
}

export async function generateInsight(args: GenerateInsightArgs): Promise<{ skipped: boolean; insight: InsightRow | null }> {
  const { db, groq, userId, bounds, primaryCurrency, nowIso, opId, opType } = args

  const metrics = await aggregateWeek(db, userId, bounds, primaryCurrency)
  if (metrics.entry_count === 0 && metrics.tasks_created === 0 && metrics.tasks_completed === 0) {
    return { skipped: true, insight: null }
  }

  const weekLabel = `week of ${bounds.startsAt.slice(0, 10)} to ${bounds.endsAt.slice(0, 10)}`
  let summary = ''
  if (groq) {
    try {
      summary = await writeDigestNarrative({ client: groq, metrics, weekLabel })
    } catch {
      summary = fallbackSummary(metrics)
    }
  } else {
    summary = fallbackSummary(metrics)
  }

  const entityId = `insight-${userId}-${bounds.startsAt.slice(0, 10)}`
  const op: Op = {
    id: opId,
    hlc: serverHlcFor(nowIso),
    device_id: 'cron',
    user_id: userId,
    entity_kind: 'insight',
    entity_id: entityId,
    op_type: opType,
    payload: {
      period: 'weekly',
      starts_at: bounds.startsAt,
      ends_at: bounds.endsAt,
      summary,
      metrics: JSON.stringify(metrics),
    },
    schema_version: 1,
  }

  await db.insertInto('op_log').values({
    id: op.id, user_id: op.user_id, hlc: op.hlc, device_id: op.device_id,
    entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type,
    payload: JSON.stringify(op.payload), schema_version: op.schema_version, applied_at: Date.now(),
  }).execute()

  await materializeRow(db, op, userId)

  const insight = await db.selectFrom('insights').where('id', '=', entityId).selectAll().executeTakeFirst()
  return { skipped: false, insight: (insight as InsightRow | undefined) ?? null }
}
