import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { createDb } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { resetAndSeedDemo } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'

// Wipes the demo database and reseeds it. Runs on the demo Worker's 4-hour cron
// (and can be POSTed once after first deploy to seed immediately). It is safe by
// construction: it refuses unless BOTH the cron bearer token matches AND
// DEMO_MODE is true — the DEMO_MODE check is an INDEPENDENT safeguard so even a
// misconfiguration that pointed this at a non-demo database could not wipe it.
export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DEMO_MODE?: string; DB: D1Database }

  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  // Independent safeguard: NEVER perform a destructive wipe outside the demo.
  if (!isDemoMode(cfEnv)) {
    return NextResponse.json({ error: 'not_demo' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)
  const { ops } = await resetAndSeedDemo(db)
  return NextResponse.json({ ok: true, ops })
}
