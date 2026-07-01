import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { parseEcbXml } from '@/lib/fx-ecb'

export const dynamic = 'force-dynamic'

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database }
  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let date: string
  let rates: Record<string, number>
  try {
    const res = await fetch(ECB_URL)
    if (!res.ok) {
      return NextResponse.json({ error: `ecb_fetch_failed_${res.status}` }, { status: 502 })
    }
    const xml = await res.text()
    const parsed = parseEcbXml(xml)
    date = parsed.date
    rates = parsed.rates
  } catch (err) {
    console.error('/api/cron/fx', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  const db = createDb(cfEnv.DB)
  let count = 0
  for (const [target, rate] of Object.entries(rates)) {
    await db
      .insertInto('fx_rates')
      .values({ date, base: 'EUR', target, rate })
      .onConflict(oc => oc.columns(['date', 'base', 'target']).doUpdateSet({ rate }))
      .execute()
    count++
  }

  return NextResponse.json({ date, count })
}
