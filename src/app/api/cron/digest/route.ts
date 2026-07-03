import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { isLocalMonday, priorWeekBounds } from '@/lib/digest-window'
import { aggregateWeek } from '@/lib/digest-aggregate'
import { writeDigestNarrative, fallbackSummary } from '@/lib/agents/digest-agent'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { applyOp } from '@/lib/op-log'
import { serverHlcFor } from '@/lib/server-hlc'
import type { Op } from '@/types/ops'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database; GROQ_API_KEY?: string }

  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)
  const groq = cfEnv.GROQ_API_KEY ? makeGroqClient(cfEnv.GROQ_API_KEY) : null
  const now = new Date().toISOString()

  // Fetch all users
  const users = await db.selectFrom('user').selectAll().execute()

  let usersProcessed = 0
  let digestsCreated = 0

  for (const user of users) {
    const prefs = await db
      .selectFrom('user_prefs')
      .where('user_id', '=', user.id)
      .selectAll()
      .executeTakeFirst()

    const primaryCurrency = prefs?.primary_currency ?? 'INR'
    const tz = prefs?.tz ?? 'Asia/Kolkata'

    usersProcessed++

    // Skip if local weekday is not Monday
    if (!isLocalMonday(now, tz)) {
      continue
    }

    // Compute prior week bounds
    const bounds = priorWeekBounds(now, tz)

    // Idempotency check
    const opId = `insight-weekly-${user.id}-${bounds.startsAt.slice(0, 10)}`
    const existingOp = await db
      .selectFrom('op_log')
      .where('id', '=', opId)
      .select('id')
      .executeTakeFirst()
    if (existingOp) {
      continue // Already processed this week for this user
    }

    // Aggregate the week
    const metrics = await aggregateWeek(db, user.id, bounds, primaryCurrency)

    // Skip if week is empty
    if (metrics.entry_count === 0 && metrics.tasks_created === 0 && metrics.tasks_completed === 0) {
      continue
    }

    // Generate narrative
    const weekLabel = `week of ${bounds.startsAt.slice(0, 10)} to ${bounds.endsAt.slice(0, 10)}`
    let summary = ''
    if (groq) {
      try {
        summary = await writeDigestNarrative({ client: groq, metrics, weekLabel })
      } catch (err) {
        console.error(`digest narrative failed for ${user.id}:`, err)
        summary = fallbackSummary(metrics)
      }
    } else {
      summary = fallbackSummary(metrics)
    }

    // Create insight op
    const entryId = `insight-${user.id}-${bounds.startsAt.slice(0, 10)}`
    const op: Op = {
      id: opId,
      hlc: serverHlcFor(now),
      device_id: 'cron',
      user_id: user.id,
      entity_kind: 'insight',
      entity_id: entryId,
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: bounds.startsAt,
        ends_at: bounds.endsAt,
        summary,
        metrics: JSON.stringify(metrics),
      },
      schema_version: 1,
    }

    // Insert op_log (Fix 2: match recur's insert exactly)
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

    // Materialize to insights table
    const merged = applyOp(undefined, op)
    await db
      .insertInto('insights')
      .values({
        id: entryId,
        user_id: user.id,
        period: 'weekly',
        starts_at: bounds.startsAt,
        ends_at: bounds.endsAt,
        summary,
        metrics: JSON.stringify(metrics),
        field_hlcs: JSON.stringify(merged.field_hlcs),
        deleted_at: null,
        created_at: merged.created_at,
        updated_at: merged.updated_at,
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()

    // Insert push_notifications row (digestsCreated increments even if push fails)
    const notifId = `digest-${user.id}-${bounds.startsAt.slice(0, 10)}`
    await db
      .insertInto('push_notifications')
      .values({
        id: notifId,
        user_id: user.id,
        title: 'Your week in review',
        body: summary.slice(0, 80),
        url: '/app',
        created_at: now,
        read_at: null,
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()

    digestsCreated++
  }

  return NextResponse.json({ users_processed: usersProcessed, digests_created: digestsCreated })
}
