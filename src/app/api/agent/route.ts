import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getSession } from '@/lib/auth'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { routeIntent } from '@/lib/agents/router'
import { parseMoneyEntry } from '@/lib/agents/money-agent'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  text: z.string().min(1).max(500),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['spend', 'income']),
  })).default([]),
})

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getCloudflareContext()
  const apiKey = (env as { GROQ_API_KEY?: string }).GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'groq_not_configured' }, { status: 500 })
  const groq = makeGroqClient(apiKey)

  try {
    const router = await routeIntent({ client: groq, text: parsed.data.text })

    if (router.intent !== 'log_money') {
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: router.intent,
        confidence: router.confidence,
        payload: null,
      })
    }

    const payload = await parseMoneyEntry({
      client: groq,
      text: parsed.data.text,
      categories: parsed.data.categories.map(c => ({ name: c.name, kind: c.kind })),
    })

    const matchedCat = parsed.data.categories.find(
      c => c.name === payload.category_name && c.kind === (payload.direction === 'out' ? 'spend' : 'income'),
    )

    return NextResponse.json({
      transcript: parsed.data.text,
      intent: 'log_money',
      confidence: router.confidence,
      payload: {
        amount: payload.amount,
        currency: payload.currency,
        direction: payload.direction,
        category_id: matchedCat?.id ?? null,
        description: payload.description,
        occurred_at: payload.occurred_at,
        source: 'manual',
        raw_input: parsed.data.text,
      },
    })
  } catch (err) {
    console.error('/api/agent', err)
    return NextResponse.json({
      transcript: parsed.data.text,
      intent: 'log_money',
      confidence: 0,
      payload: null,
      error: (err as Error).message,
    }, { status: 502 })
  }
}
