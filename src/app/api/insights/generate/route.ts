import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { currentWeekBounds } from '@/lib/digest-window'
import { generateInsight } from '@/lib/insight-generate'
import { parseFxOverrides } from '@/lib/fx'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { env } = getCloudflareContext()
  const cfEnv = env as { DB: D1Database; GROQ_API_KEY?: string }
  const db = createDb(cfEnv.DB)
  const groq = cfEnv.GROQ_API_KEY ? makeGroqClient(cfEnv.GROQ_API_KEY) : null

  const prefs = await db.selectFrom('user_prefs').where('user_id', '=', userId).selectAll().executeTakeFirst()
  const primaryCurrency = prefs?.primary_currency ?? 'INR'
  const tz = prefs?.tz ?? 'Asia/Kolkata'

  const nowIso = new Date().toISOString()
  const bounds = currentWeekBounds(nowIso, tz)
  const weekStart = bounds.startsAt.slice(0, 10)
  const entityId = `insight-${userId}-${weekStart}`

  // create vs refresh: does a row for this week already exist?
  const existing = await db.selectFrom('insights').where('id', '=', entityId).select('id').executeTakeFirst()
  const opType = existing ? 'update' : 'create'
  const opId = `insight-ondemand-${userId}-${weekStart}-${Date.now()}`

  const { skipped, insight } = await generateInsight({ db, groq, userId, bounds, primaryCurrency, fx_overrides: parseFxOverrides(prefs?.fx_overrides), nowIso, opId, opType })
  if (skipped) return NextResponse.json({ ok: false, reason: 'empty_week' })
  return NextResponse.json({ ok: true, insight })
}
