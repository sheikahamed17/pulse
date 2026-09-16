import { NextResponse } from 'next/server'
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

  // Chunk `targets` to stay under D1's 100-bound-parameter-per-query cap
  // (each chunk query also carries the `since` param). `targets` is
  // user-supplied via the query string, so an unbounded IN-list would 500;
  // realistically this is a single chunk. Re-sort the merged result to keep
  // the original date-descending contract across chunks.
  const uniqueTargets = [...new Set(targets)]
  const CHUNK = 90
  const chunks = await Promise.all(
    Array.from({ length: Math.ceil(uniqueTargets.length / CHUNK) }, (_, i) =>
      db
        .selectFrom('fx_rates')
        .where('date', '>=', since)
        .where('target', 'in', uniqueTargets.slice(i * CHUNK, (i + 1) * CHUNK))
        .orderBy('date', 'desc')
        .selectAll()
        .execute(),
    ),
  )
  const rates = chunks.flat().sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json({ rates }, {
    headers: {
      // Client caches rates for 1 hour (rates change at most daily).
      'cache-control': 'private, max-age=3600',
    },
  })
}
