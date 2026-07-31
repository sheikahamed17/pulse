import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeIngestToken, hashSecret } from '@/lib/ingest-token'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const { token, secret } = makeIngestToken(userId)
  const hash = await hashSecret(secret)
  const now = new Date().toISOString()

  await db
    .insertInto('user_prefs')
    .values({ user_id: userId, primary_currency: 'INR', tz: 'Asia/Kolkata', fx_overrides: null, sms_ingest_token_hash: hash, updated_at: now })
    .onConflict(oc => oc.column('user_id').doUpdateSet({ sms_ingest_token_hash: hash, updated_at: now }))
    .execute()

  // Returned ONCE; only the hash is stored.
  return NextResponse.json({ token })
}
