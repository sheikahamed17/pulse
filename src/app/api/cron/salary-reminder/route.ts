import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sendPushToUser } from '@/lib/web-push'
import { isSalaryReminderDay, buildSalaryReminder } from '@/lib/salary-reminder'

export const dynamic = 'force-dynamic'

// Rides the daily 0 3 tick (see CRON_SECONDARY). For each opted-in user, if today
// is the last working day of the month IN THEIR tz, push a one-per-month reminder
// to log their salary (income that arrives with no email/SMS to auto-ingest).
export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }
  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)
  const now = new Date().toISOString()

  const users = await db.selectFrom('user_prefs')
    .where('salary_reminder', '=', 1)
    .select(['user_id', 'tz'])
    .execute()

  let remindersCreated = 0
  const usersToPush = new Set<string>()

  for (const u of users) {
    const tz = u.tz || 'Asia/Kolkata'
    if (!isSalaryReminderDay(now, tz)) continue

    const reminder = buildSalaryReminder(u.user_id, now, tz)
    // Dedup: one reminder per user per month (the daily tick may fire many times).
    const exists = await db.selectFrom('push_notifications').where('id', '=', reminder.id).select('id').executeTakeFirst()
    if (exists) continue

    await db.insertInto('push_notifications').values({
      id: reminder.id,
      user_id: u.user_id,
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
      created_at: now,
      read_at: null,
    }).execute()
    remindersCreated++
    usersToPush.add(u.user_id)
  }

  let usersPushed = 0
  for (const userId of usersToPush) {
    try {
      await sendPushToUser(db, { VAPID_PRIVATE_KEY: cfEnv.VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY: cfEnv.VAPID_PUBLIC_KEY }, userId)
      usersPushed++
    } catch (err) {
      console.error(`/api/cron/salary-reminder: sendPushToUser failed for ${userId}:`, err)
    }
  }

  return NextResponse.json({ reminders_created: remindersCreated, users_pushed: usersPushed })
}
