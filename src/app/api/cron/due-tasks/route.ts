import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sendPushToUser } from '@/lib/web-push'
import { formatLocalDateTime } from '@/lib/format'
import { overdueNudge } from '@/lib/overdue-nudge'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }

  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)
  const now = new Date().toISOString()

  // Step 2: Load due tasks and user preferences
  const dueTasks = await db
    .selectFrom('tasks')
    .where('due_at', '<=', now)
    .where('completed_at', 'is', null)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  // Group by user_id to load prefs once per user
  const userIds = [...new Set(dueTasks.map(t => t.user_id))]
  const userPrefsMap = new Map<string, { tz: string }>()
  for (const userId of userIds) {
    const prefs = await db
      .selectFrom('user_prefs')
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst()
    userPrefsMap.set(userId, {
      tz: prefs?.tz ?? 'Asia/Kolkata',
    })
  }

  // Step 3: Check idempotency and insert notification rows
  const notifIds = new Set<string>()
  let notifiedTaskCount = 0

  for (const task of dueTasks) {
    const dueAtStr = task.due_at ?? ''
    const userTz = userPrefsMap.get(task.user_id)?.tz ?? 'Asia/Kolkata'

    // Once-ever due notification.
    const notifId = `due-${task.id}-${dueAtStr}`
    const exists = await db
      .selectFrom('push_notifications')
      .where('id', '=', notifId)
      .select('id')
      .executeTakeFirst()
    if (!exists) {
      await db
        .insertInto('push_notifications')
        .values({
          id: notifId,
          user_id: task.user_id,
          title: `Task due: ${task.title.slice(0, 60)}`,
          body: formatLocalDateTime(dueAtStr, userTz),
          url: '/app?tab=tasks',
          created_at: now,
          read_at: null,
        })
        .execute()
      notifIds.add(task.user_id)
      notifiedTaskCount++
    }

    // Daily overdue re-nudge (rides this same sweep; per-day dedup id).
    const nudge = overdueNudge(task, now, userTz)
    if (nudge) {
      const nExists = await db
        .selectFrom('push_notifications')
        .where('id', '=', nudge.notifId)
        .select('id')
        .executeTakeFirst()
      if (!nExists) {
        await db
          .insertInto('push_notifications')
          .values({
            id: nudge.notifId,
            user_id: task.user_id,
            title: nudge.title,
            body: nudge.body,
            url: '/app?tab=tasks',
            created_at: now,
            read_at: null,
          })
          .execute()
        notifIds.add(task.user_id)
        notifiedTaskCount++
      }
    }
  }

  // Step 4: Send push to each distinct user with new notifications
  let usersPushed = 0
  for (const userId of notifIds) {
    try {
      await sendPushToUser(db, {
        VAPID_PRIVATE_KEY: cfEnv.VAPID_PRIVATE_KEY,
        VAPID_PUBLIC_KEY: cfEnv.VAPID_PUBLIC_KEY,
      }, userId)
      usersPushed++
    } catch (err) {
      console.error(`/api/cron/due-tasks: sendPushToUser failed for user ${userId}:`, err)
    }
  }

  return NextResponse.json({
    notified_tasks: notifiedTaskCount,
    users_pushed: usersPushed,
  })
}
