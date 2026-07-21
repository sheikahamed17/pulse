import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { isLocalMonday, priorWeekBounds } from '@/lib/digest-window'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { generateInsight } from '@/lib/insight-generate'
import { sendPushToUser } from '@/lib/web-push'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database; GROQ_API_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }

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

    // Idempotency check (unchanged)
    const opId = `insight-weekly-${user.id}-${bounds.startsAt.slice(0, 10)}`
    const existingOp = await db.selectFrom('op_log').where('id', '=', opId).select('id').executeTakeFirst()
    if (existingOp) continue

    const { skipped, insight } = await generateInsight({
      db, groq, userId: user.id, bounds, primaryCurrency, nowIso: now,
      opId, opType: 'create',
    })
    if (skipped) continue

    // Push (unchanged): insert push_notifications + sendPushToUser
    const notifId = `digest-${user.id}-${bounds.startsAt.slice(0, 10)}`
    await db.insertInto('push_notifications').values({
      id: notifId, user_id: user.id, title: 'Your week in review',
      body: (insight?.summary ?? '').slice(0, 80), url: '/app', created_at: now, read_at: null,
    }).onConflict(oc => oc.column('id').doNothing()).execute()
    try { await sendPushToUser(db, cfEnv, user.id) } catch (err) { console.error(`digest cron: sendPushToUser failed for ${user.id}:`, err) }
    digestsCreated++
  }

  return NextResponse.json({ users_processed: usersProcessed, digests_created: digestsCreated })
}
