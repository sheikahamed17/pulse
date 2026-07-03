import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  try {
    // Fetch up to 10 oldest unread notifications for this user
    const notifs = await db
      .selectFrom('push_notifications')
      .where('user_id', '=', session.user.id)
      .where('read_at', 'is', null)
      .orderBy('created_at', 'asc')
      .limit(10)
      .selectAll()
      .execute()

    // Mark them as read
    if (notifs.length > 0) {
      const ids = notifs.map(n => n.id)
      const now = new Date().toISOString()
      await db
        .updateTable('push_notifications')
        .set({ read_at: now })
        .where('id', 'in', ids)
        .execute()
    }

    return NextResponse.json({
      notifications: notifs.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        url: n.url,
      })),
    })
  } catch (err) {
    console.error('/api/push/pending', err)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
