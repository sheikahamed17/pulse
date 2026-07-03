import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = SubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { endpoint, keys } = parsed.data
  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  try {
    await db
      .insertInto('push_subscriptions')
      .values({
        id: crypto.randomUUID(),
        user_id: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        failed_count: 0,
        created_at: new Date().toISOString(),
      })
      .onConflict(oc => oc.column('endpoint').doUpdateSet({
        p256dh: keys.p256dh,
        auth: keys.auth,
        failed_count: 0,
      }))
      .execute()

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('/api/push/subscribe', err)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = UnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { endpoint } = parsed.data
  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  try {
    await db
      .deleteFrom('push_subscriptions')
      .where('user_id', '=', session.user.id)
      .where('endpoint', '=', endpoint)
      .execute()

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('/api/push/subscribe DELETE', err)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
