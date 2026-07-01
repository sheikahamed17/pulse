import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export const dynamic = 'force-dynamic'

const DEFAULTS = { primary_currency: 'INR', tz: 'Asia/Kolkata' } as const

const PutSchema = z.object({
  primary_currency: z.enum(SUPPORTED_CURRENCIES),
  tz: z.string().min(1).max(64),
})

export async function GET(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const row = await db
    .selectFrom('user_prefs')
    .where('user_id', '=', session.user.id)
    .selectAll()
    .executeTakeFirst()

  if (!row) {
    return NextResponse.json({ ...DEFAULTS, user_id: session.user.id })
  }
  return NextResponse.json({
    user_id: row.user_id,
    primary_currency: row.primary_currency,
    tz: row.tz,
    updated_at: row.updated_at,
  })
}

export async function PUT(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const now = new Date().toISOString()
  await db
    .insertInto('user_prefs')
    .values({
      user_id: session.user.id,
      primary_currency: parsed.data.primary_currency,
      tz: parsed.data.tz,
      updated_at: now,
    })
    .onConflict(oc => oc.column('user_id').doUpdateSet({
      primary_currency: parsed.data.primary_currency,
      tz: parsed.data.tz,
      updated_at: now,
    }))
    .execute()

  return NextResponse.json({
    user_id: session.user.id,
    primary_currency: parsed.data.primary_currency,
    tz: parsed.data.tz,
    updated_at: now,
  })
}
