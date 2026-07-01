import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const since = url.searchParams.get('since')
  const targetsParam = url.searchParams.get('targets')

  if (!since || !DATE_RE.test(since)) {
    return NextResponse.json({ error: 'since: YYYY-MM-DD required' }, { status: 400 })
  }
  if (!targetsParam) {
    return NextResponse.json({ error: 'targets: comma-separated currency codes required' }, { status: 400 })
  }

  const targets = targetsParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  if (targets.length === 0) {
    return NextResponse.json({ error: 'targets: at least one code required' }, { status: 400 })
  }

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const rates = await db
    .selectFrom('fx_rates')
    .where('date', '>=', since)
    .where('target', 'in', targets)
    .orderBy('date', 'desc')
    .selectAll()
    .execute()

  return NextResponse.json({ rates }, {
    headers: {
      // Client caches rates for 1 hour (rates change at most daily).
      'cache-control': 'private, max-age=3600',
    },
  })
}
