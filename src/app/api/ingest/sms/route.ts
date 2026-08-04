import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { parseSms } from '@/lib/agents/sms-agent'
import { parseIngestToken, hashSecret } from '@/lib/ingest-token'
import { smsToMoneyPayload, smsEntityId, smsOpId } from '@/lib/sms-ingest'
import { serverHlcFor } from '@/lib/server-hlc'
import { materializeRow } from '@/lib/materialize'
import type { Op } from '@/types/ops'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const parsed = parseIngestToken(token)
  if (!parsed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { env } = getCloudflareContext()
  const cfEnv = env as { DB: D1Database; GROQ_API_KEY?: string }
  const db = createDb(cfEnv.DB)

  const prefs = await db.selectFrom('user_prefs').where('user_id', '=', parsed.userId).selectAll().executeTakeFirst()
  if (!prefs?.sms_ingest_token_hash || (await hashSecret(parsed.secret)) !== prefs.sms_ingest_token_hash) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const userId = parsed.userId

  let body: { text?: unknown; source?: unknown; dryRun?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const text = (typeof body.text === 'string' ? body.text.trim() : '').slice(0, 4000)
  if (!text) return NextResponse.json({ error: 'missing text' }, { status: 400 })
  const source = body.source === 'email' ? 'email' : 'sms'
  const dryRun = body.dryRun === true

  if (!cfEnv.GROQ_API_KEY) return NextResponse.json({ error: 'no parser' }, { status: 503 })
  const client = makeGroqClient(cfEnv.GROQ_API_KEY)

  const nowIso = new Date().toISOString()
  const primary = prefs.primary_currency ?? 'INR'
  let agentOut
  try {
    agentOut = await parseSms({ client, text, defaultCurrency: primary })
  } catch (err) {
    // Groq rate-limit (429) / transient error / invalid response: fail RETRYABLE
    // (503), never 500 — the forwarder (Apps Script / Shortcut) retries next tick.
    console.error('sms-ingest parse error', err)
    return NextResponse.json({ error: 'parse failed, retry later' }, { status: 503 })
  }
  const payload = smsToMoneyPayload(agentOut, primary, nowIso, text, source)
  // Token-gated dry-run: return exactly what the parser extracted, write NO op.
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, agentOut, payload })
  if (!payload) return NextResponse.json({ ok: true, added: false })

  const opId = await smsOpId(userId, text)
  const dup = await db.selectFrom('op_log').where('id', '=', opId).select('id').executeTakeFirst()
  if (dup) return NextResponse.json({ ok: true, added: false })

  const op: Op = {
    id: opId,
    hlc: serverHlcFor(nowIso),
    device_id: 'sms-ingest',
    user_id: userId,
    entity_kind: 'money',
    entity_id: await smsEntityId(userId, text),
    op_type: 'create',
    payload: payload as unknown as Record<string, unknown>,
    schema_version: 1,
  }
  // on-conflict-do-nothing: a concurrent duplicate POST (both past the dup-check
  // above before either inserts) must not throw a PK violation — the deterministic
  // op.id makes the second insert a no-op, keeping the endpoint idempotent.
  await db.insertInto('op_log').values({
    id: op.id, user_id: op.user_id, hlc: op.hlc, device_id: op.device_id,
    entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type,
    payload: JSON.stringify(op.payload), schema_version: op.schema_version, applied_at: Date.now(),
  }).onConflict(oc => oc.column('id').doNothing()).execute()
  await materializeRow(db, op, userId)

  return NextResponse.json({ ok: true, added: true })
}
