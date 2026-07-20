import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { routeIntent } from '@/lib/agents/router'
import { parseMoneyEntry } from '@/lib/agents/money-agent'
import { parseTaskEntry } from '@/lib/agents/task-agent'
import { parseMoneyQuery } from '@/lib/agents/query-money-agent'
import { parseTaskQuery } from '@/lib/agents/query-task-agent'
import { parseLearningQuery } from '@/lib/agents/query-learning-agent'
import { parseLearning } from '@/lib/agents/learning-agent'
import { parseNote } from '@/lib/agents/note-agent'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  text: z.string().min(1).max(500),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['spend', 'income']),
  })).default([]),
})

async function loadUserPrefs(db: ReturnType<typeof createDb>, userId: string) {
  const row = await db
    .selectFrom('user_prefs')
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst()
  return {
    primary_currency: row?.primary_currency ?? 'INR',
    tz: row?.tz ?? 'Asia/Kolkata',
  }
}

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

  const db = createDb((env as { DB: D1Database }).DB)
  const prefs = await loadUserPrefs(db, session.user.id)
  const nowIso = new Date().toISOString()

  try {
    const router = await routeIntent({ client: groq, text: parsed.data.text })

    if (router.intent === 'log_money') {
      const payload = await parseMoneyEntry({
        client: groq,
        text: parsed.data.text,
        categories: parsed.data.categories.map(c => ({ name: c.name, kind: c.kind })),
        nowIso,
        userTz: prefs.tz,
        defaultCurrency: prefs.primary_currency,
      })
      const matchedCat = parsed.data.categories.find(
        c => c.name === payload.category_name && c.kind === (payload.direction === 'out' ? 'spend' : 'income'),
      )
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'log_money',
        confidence: router.confidence,
        payload: {
          kind: 'money',
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
    }

    if (router.intent === 'log_task') {
      const payload = await parseTaskEntry({
        client: groq,
        text: parsed.data.text,
        nowIso,
        userTz: prefs.tz,
      })
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'log_task',
        confidence: router.confidence,
        payload: {
          kind: 'task',
          title: payload.title,
          due_at: payload.due_at,
          priority: payload.priority,
          completed_at: null,
          source: 'manual',
          raw_input: parsed.data.text,
        },
      })
    }

    if (router.intent === 'log_learning') {
      const payload = await parseLearning({
        client: groq,
        text: parsed.data.text,
      })
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'log_learning',
        confidence: router.confidence,
        payload: {
          kind: 'learning',
          text: payload.text,
          tags: payload.tags,
          attribution: payload.attribution ?? null,
          occurred_at: nowIso,
          source: 'manual',
        },
      })
    }

    if (router.intent === 'log_note') {
      const payload = await parseNote({
        client: groq,
        text: parsed.data.text,
      })
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'log_note',
        confidence: router.confidence,
        payload: {
          kind: 'note',
          body: parsed.data.text,
          title: payload.title ?? null,
          tags: payload.tags,
          occurred_at: nowIso,
          source: 'manual',
        },
      })
    }

    if (router.intent === 'query_money') {
      const plan = await parseMoneyQuery({
        client: groq,
        text: parsed.data.text,
        categories: parsed.data.categories.map(c => ({ name: c.name, kind: c.kind })),
        nowIso,
        userTz: prefs.tz,
      })
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'query_money',
        confidence: router.confidence,
        payload: {
          kind: 'query_money',
          direction: plan.direction,
          category_name: plan.category_name,
          mode: plan.mode,
          bucket: plan.bucket,
          period: plan.period,
        },
      })
    }

    if (router.intent === 'query_task') {
      const plan = await parseTaskQuery({
        client: groq,
        text: parsed.data.text,
        nowIso,
        userTz: prefs.tz,
      })
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'query_task',
        confidence: router.confidence,
        payload: {
          kind: 'query_task',
          status: plan.status,
          period: plan.period,
        },
      })
    }

    if (router.intent === 'query_learning') {
      const plan = await parseLearningQuery({
        client: groq,
        text: parsed.data.text,
        nowIso,
        userTz: prefs.tz,
      })
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: 'query_learning',
        confidence: router.confidence,
        payload: {
          kind: 'query_learning',
          search: plan.search,
          tags: plan.tags,
          period: plan.period,
        },
      })
    }

    return NextResponse.json({
      transcript: parsed.data.text,
      intent: router.intent,
      confidence: router.confidence,
      payload: null,
    })
  } catch (err) {
    console.error('/api/agent', err)
    return NextResponse.json({
      transcript: parsed.data.text,
      intent: null,
      confidence: 0,
      payload: null,
      error: (err as Error).message,
    }, { status: 502 })
  }
}
