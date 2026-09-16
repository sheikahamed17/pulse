import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { isDemoMode, DEMO_RESET_HOURS } from '@/lib/demo'

export const dynamic = 'force-dynamic'

// Lets the client learn (at runtime, no build-time divergence) whether this
// deployment is the public demo, so it can show the banner, the "try me"
// examples, and hide export/import / ingest / push. Returns only booleans.
export function GET() {
  const { env } = getCloudflareContext()
  const demoMode = isDemoMode(env as { DEMO_MODE?: string })
  return NextResponse.json({ demoMode, resetHours: demoMode ? DEMO_RESET_HOURS : null })
}
