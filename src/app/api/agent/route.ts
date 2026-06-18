import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  text: z.string().min(1).max(500),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['spend', 'income']),
  })).optional().default([]),
})

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Stub: Task 19 replaces this with real routeIntent + parseMoneyEntry calls.
  return NextResponse.json({
    transcript: parsed.data.text,
    intent: 'log_money',
    confidence: 0.5,
    payload: {
      amount: 0, currency: 'INR', direction: 'out',
      occurred_at: new Date().toISOString(),
      source: 'manual',
      raw_input: parsed.data.text,
    },
  })
}
