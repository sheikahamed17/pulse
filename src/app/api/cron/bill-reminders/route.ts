import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sendPushToUser } from '@/lib/web-push'
import { convertViaRates, parseFxOverrides } from '@/lib/fx'
import { upcomingOccurrences } from '@/lib/forecast'
import { buildBillReminders, LEAD_DAYS } from '@/lib/bill-reminders'
import type { RecurringRuleRow } from '@/lib/dexie'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }
  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)
  const now = new Date().toISOString()
  const toIso = new Date(Date.now() + LEAD_DAYS * 86400000).toISOString()

  const rules = await db.selectFrom('recurring_rules')
    .where('is_active', '=', 1)
    .where('deleted_at', 'is', null)
    .where('direction', '=', 'out')
    .selectAll()
    .execute()
  const byUser = new Map<string, typeof rules>()
  for (const r of rules) {
    const list = byUser.get(r.user_id) ?? []
    list.push(r)
    byUser.set(r.user_id, list)
  }

  const fxRates = await db.selectFrom('fx_rates').select(['date', 'target', 'rate']).execute()
  let remindersCreated = 0
  const usersToPush = new Set<string>()

  for (const [userId, userRules] of byUser) {
    const prefs = await db.selectFrom('user_prefs').where('user_id', '=', userId).selectAll().executeTakeFirst()
    const primary = prefs?.primary_currency ?? 'INR'
    const fxOverrides = parseFxOverrides(prefs?.fx_overrides)

    const events = await upcomingOccurrences(userRules as unknown as RecurringRuleRow[], now, toIso)
    const outEvents = events.filter(e => e.direction === 'out')

    const toPrimary = (amount: number, currency: string): number => {
      if (currency === primary) return amount
      const conv = convertViaRates(amount, currency, primary, now, fxRates, fxOverrides)
      return conv ? conv.amount : amount
    }

    const reminders = buildBillReminders(outEvents, now, primary, toPrimary)

    for (const reminder of reminders) {
      const exists = await db.selectFrom('push_notifications').where('id', '=', reminder.id).select('id').executeTakeFirst()
      if (exists) continue
      await db.insertInto('push_notifications').values({
        id: reminder.id,
        user_id: userId,
        title: reminder.title,
        body: reminder.body,
        url: reminder.url,
        created_at: now,
        read_at: null,
      }).execute()
      remindersCreated++
      usersToPush.add(userId)
    }
  }

  let usersPushed = 0
  for (const userId of usersToPush) {
    try {
      await sendPushToUser(db, { VAPID_PRIVATE_KEY: cfEnv.VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY: cfEnv.VAPID_PUBLIC_KEY }, userId)
      usersPushed++
    } catch (err) {
      console.error(`/api/cron/bill-reminders: sendPushToUser failed for ${userId}:`, err)
    }
  }

  return NextResponse.json({ reminders_created: remindersCreated, users_pushed: usersPushed })
}
