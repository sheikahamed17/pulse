import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export const dynamic = 'force-dynamic'

const DEFAULTS = { primary_currency: 'INR', tz: 'Asia/Kolkata' } as const

const PutSchema = z.object({
  primary_currency: z.enum(SUPPORTED_CURRENCIES),
  tz: z.string().min(1).max(64),
  // string keys (a z.enum key would make the record exhaustive/require all currencies);
  // non-currency keys are filtered out server-side before persisting.
  fx_overrides: z.record(z.string(), z.number().positive().finite()).optional(),
  // Optional so an older cached client that omits it doesn't reset the flag —
  // the PUT preserves the stored value when this is absent.
  salary_reminder: z.boolean().optional(),
})

function parseOverrides(raw: unknown): Record<string, number> {
  if (typeof raw !== 'string' || !raw) return {}
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(o)) {
      if ((SUPPORTED_CURRENCIES as readonly string[]).includes(k) && typeof v === 'number' && isFinite(v) && v > 0) out[k] = v
    }
    return out
  } catch { return {} }
}

export async function GET(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const row = await db
    .selectFrom('user_prefs')
    .where('user_id', '=', session.user.id)
    .selectAll()
    .executeTakeFirst()

  if (!row) {
    return NextResponse.json({ ...DEFAULTS, fx_overrides: {}, salary_reminder: false, user_id: session.user.id })
  }
  return NextResponse.json({
    user_id: row.user_id,
    primary_currency: row.primary_currency,
    tz: row.tz,
    fx_overrides: parseOverrides(row.fx_overrides),
    salary_reminder: row.salary_reminder === 1,
    updated_at: row.updated_at,
  })
}

export async function PUT(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getCloudflareContext()
  const db = createDb((env as { DB: D1Database }).DB)

  const fxClean = parsed.data.fx_overrides
    ? Object.fromEntries(Object.entries(parsed.data.fx_overrides).filter(([k]) => (SUPPORTED_CURRENCIES as readonly string[]).includes(k)))
    : {}
  const fxJson = Object.keys(fxClean).length ? JSON.stringify(fxClean) : null

  // Preserve the stored salary_reminder when the client omits it (older cached
  // client saving other prefs must not silently turn the reminder off).
  const existing = await db.selectFrom('user_prefs').where('user_id', '=', session.user.id).select('salary_reminder').executeTakeFirst()
  const salaryReminder = (parsed.data.salary_reminder ?? (existing?.salary_reminder === 1)) ? 1 : 0

  const now = new Date().toISOString()
  await db
    .insertInto('user_prefs')
    .values({
      user_id: session.user.id,
      primary_currency: parsed.data.primary_currency,
      tz: parsed.data.tz,
      fx_overrides: fxJson,
      salary_reminder: salaryReminder,
      updated_at: now,
    })
    .onConflict(oc => oc.column('user_id').doUpdateSet({
      primary_currency: parsed.data.primary_currency,
      tz: parsed.data.tz,
      fx_overrides: fxJson,
      salary_reminder: salaryReminder,
      updated_at: now,
    }))
    .execute()

  return NextResponse.json({
    user_id: session.user.id,
    primary_currency: parsed.data.primary_currency,
    tz: parsed.data.tz,
    fx_overrides: fxClean,
    salary_reminder: salaryReminder === 1,
    updated_at: now,
  })
}
