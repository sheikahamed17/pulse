import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { groqWhisper } from '@/lib/agents/whisper'
import { routeIntent } from '@/lib/agents/router'
import { parseMoneyEntry } from '@/lib/agents/money-agent'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })

  const audio = formData.get('audio')
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'audio blob missing' }, { status: 400 })

  const { env } = getCloudflareContext()
  const apiKey = (env as { GROQ_API_KEY?: string }).GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'groq_not_configured' }, { status: 500 })
  const groq = makeGroqClient(apiKey)

  const d1 = (env as { DB: D1Database }).DB
  const db = createDb(d1)
  const cats = await db
    .selectFrom('categories')
    .where('user_id', '=', userId)
    .where('is_archived', '=', 0)
    .where('deleted_at', 'is', null)
    .select(['id', 'name', 'kind'])
    .execute()

  let transcript = ''
  try {
    const w = await groqWhisper({ client: groq, blob: audio, filename: 'voice.webm' })
    transcript = w.transcript
  } catch (err) {
    return NextResponse.json({
      transcript: '', intent: null, confidence: 0, payload: null,
      error: `whisper: ${(err as Error).message}`,
    }, { status: 502 })
  }

  try {
    const router = await routeIntent({ client: groq, text: transcript })
    if (router.intent !== 'log_money') {
      return NextResponse.json({ transcript, intent: router.intent, confidence: router.confidence, payload: null })
    }

    const payload = await parseMoneyEntry({
      client: groq,
      text: transcript,
      categories: cats.map(c => ({ name: c.name, kind: c.kind as 'spend' | 'income' })),
    })

    const matchedCat = cats.find(
      c => c.name === payload.category_name && c.kind === (payload.direction === 'out' ? 'spend' : 'income'),
    )

    return NextResponse.json({
      transcript,
      intent: 'log_money',
      confidence: router.confidence,
      payload: {
        amount: payload.amount,
        currency: payload.currency,
        direction: payload.direction,
        category_id: matchedCat?.id ?? null,
        description: payload.description,
        occurred_at: payload.occurred_at,
        source: 'voice',
        raw_input: transcript,
      },
    })
  } catch (err) {
    return NextResponse.json({
      transcript, intent: null, confidence: 0, payload: null,
      error: (err as Error).message,
    }, { status: 502 })
  }
}
