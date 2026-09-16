import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isEmailConfigured } from '@/lib/setup'

export const dynamic = 'force-dynamic'

// Drives the /setup wizard: whether an owner exists yet, and whether magic-link
// email can actually be delivered. Returns only booleans (no user data), so it
// is safe to call before any account exists.
export async function GET() {
  const { env } = getCloudflareContext()
  const cfEnv = env as { DB: D1Database; RESEND_API_KEY?: string; EMAIL_FROM?: string }
  const db = createDb(cfEnv.DB)
  const row = await db.selectFrom('user').select('id').limit(1).executeTakeFirst()
  return NextResponse.json({
    usersExist: Boolean(row),
    emailConfigured: isEmailConfigured(cfEnv),
  })
}
