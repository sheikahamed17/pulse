import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { groqWhisper } from '@/lib/agents/whisper'
import { routeIntent } from '@/lib/agents/router'
import { parseMoneyEntry } from '@/lib/agents/money-agent'
import { parseTaskEntry } from '@/lib/agents/task-agent'
import { parseLearning } from '@/lib/agents/learning-agent'
import { parseNote } from '@/lib/agents/note-agent'

export const dynamic = 'force-dynamic'

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
  const prefs = await loadUserPrefs(db, userId)

  // Fetch categories (needed for log_money path; harmless on log_task path)
  const cats = await db
    .selectFrom('categories')
    .where('user_id', '=', userId)
    .where('is_archived', '=', 0)
    .where('deleted_at', 'is', null)
    .select(['id', 'name', 'kind'])
    .execute()

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`))

      try {
        send({ step: 'transcribing' })
        const { transcript } = await groqWhisper({ client: groq, blob: audio, filename: 'voice.webm' })
        send({ step: 'transcript', text: transcript })

        send({ step: 'parsing' })
        const router = await routeIntent({ client: groq, text: transcript })

        const nowIso = new Date().toISOString()

        if (router.intent === 'log_money') {
          const payload = await parseMoneyEntry({
            client: groq,
            text: transcript,
            categories: cats.map(c => ({ name: c.name, kind: c.kind as 'spend' | 'income' })),
            nowIso,
            userTz: prefs.tz,
            defaultCurrency: prefs.primary_currency,
          })
          const matchedCat = cats.find(
            c => c.name === payload.category_name && c.kind === (payload.direction === 'out' ? 'spend' : 'income'),
          )
          send({
            step: 'payload',
            intent: 'log_money',
            transcript,
            payload: {
              kind: 'money',
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
        } else if (router.intent === 'log_task') {
          const payload = await parseTaskEntry({
            client: groq,
            text: transcript,
            nowIso,
            userTz: prefs.tz,
          })
          send({
            step: 'payload',
            intent: 'log_task',
            transcript,
            payload: {
              kind: 'task',
              title: payload.title,
              due_at: payload.due_at,
              priority: payload.priority,
              completed_at: null,
              source: 'voice',
              raw_input: transcript,
            },
          })
        } else if (router.intent === 'log_learning') {
          const payload = await parseLearning({
            client: groq,
            text: transcript,
          })
          send({
            step: 'payload',
            intent: 'log_learning',
            transcript,
            payload: {
              kind: 'learning',
              text: payload.text,
              tags: payload.tags,
              attribution: payload.attribution ?? null,
              occurred_at: nowIso,
              source: 'voice',
            },
          })
        } else if (router.intent === 'log_note') {
          const payload = await parseNote({
            client: groq,
            text: transcript,
          })
          send({
            step: 'payload',
            intent: 'log_note',
            transcript,
            payload: {
              kind: 'note',
              body: transcript,
              title: payload.title ?? null,
              tags: payload.tags,
              occurred_at: nowIso,
              source: 'voice',
            },
          })
        } else {
          // query_money / query_task / chat — no payload yet (query_money lands in 2.6)
          send({
            step: 'payload',
            intent: router.intent,
            transcript,
            payload: null,
          })
        }
      } catch (err) {
        send({ step: 'error', message: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
  })
}
