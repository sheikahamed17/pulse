import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { computeNextDue, checkEndConditions, type RecurringRule } from '@/lib/recurring'
import { applyOp } from '@/lib/op-log'
import type { Op } from '@/types/ops'

export const dynamic = 'force-dynamic'

const CRON_SAFETY_CAP = 100
const RUN_BATCH_SIZE = 1000

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database }

  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)

  const now = new Date().toISOString()
  const dueRules = await db
    .selectFrom('recurring_rules')
    .where('next_due_at', '<=', now)
    .where('is_active', '=', 1)
    .where('deleted_at', 'is', null)
    .selectAll()
    .limit(RUN_BATCH_SIZE)
    .execute()

  let processed = 0
  for (const row of dueRules) {
    let rule = rowToRule(row)
    let safety = CRON_SAFETY_CAP
    while (rule.next_due_at <= new Date().toISOString() && rule.is_active === 1 && safety-- > 0) {
      await emitEntry(db, rule, row.user_id)
      const advanced = computeNextDue(rule)
      const end = checkEndConditions({ ...rule, next_due_at: advanced })
      rule = {
        ...rule,
        next_due_at: advanced,
        occurrences_so_far: rule.occurrences_so_far + 1,
        is_active: end.is_active,
      }
      await db
        .updateTable('recurring_rules')
        .set({
          next_due_at: rule.next_due_at,
          occurrences_so_far: rule.occurrences_so_far,
          is_active: rule.is_active,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', rule.id)
        .execute()
      processed++
    }
  }

  return NextResponse.json({ processed })
}

// Authenticate the cron endpoint with a server-only shared secret. The
// previously-used `cf-cron` / `x-cf-trigger` headers are user-controllable
// (any client can set them); Cloudflare's scheduled trigger fires via the
// Worker `scheduled()` handler, NOT via an HTTP call with a special header.
// So this route MUST be called via either: (a) the shim Worker's
// scheduled() handler which reads env.CRON_SECRET and forwards as Bearer
// auth, or (b) a deliberate manual trigger that includes the same secret.
//
// Web Crypto lacks crypto.timingSafeEqual (Node-only); a length-equal
// XOR loop is the portable constant-time equivalent.
function isAuthorizedCron(req: Request, env: { CRON_SECRET?: string }): boolean {
  const auth = req.headers.get('authorization')
  if (!auth || !env.CRON_SECRET) return false
  const expected = `Bearer ${env.CRON_SECRET}`
  if (auth.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < auth.length; i++) {
    mismatch |= auth.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

function rowToRule(row: {
  id: string; period: string; interval_count: number; anchor_at: string; next_due_at: string;
  occurrences_so_far: number; end_condition_kind: string; end_until: string | null; end_count: number | null;
  is_active: number;
}): RecurringRule {
  return {
    id: row.id,
    period: row.period as RecurringRule['period'],
    interval_count: row.interval_count,
    anchor_at: row.anchor_at,
    next_due_at: row.next_due_at,
    occurrences_so_far: row.occurrences_so_far,
    end_condition_kind: row.end_condition_kind as RecurringRule['end_condition_kind'],
    end_until: row.end_until,
    end_count: row.end_count,
    is_active: row.is_active,
  }
}

async function emitEntry(
  db: ReturnType<typeof createDb>,
  rule: RecurringRule,
  userId: string,
) {
  const opId = `recur-${rule.id}-${rule.next_due_at}`
  const exists = await db
    .selectFrom('op_log')
    .where('id', '=', opId)
    .select('id')
    .executeTakeFirst()
  if (exists) return

  const tpl = await db
    .selectFrom('recurring_rules')
    .where('id', '=', rule.id)
    .select(['amount', 'currency', 'direction', 'category_id', 'description'])
    .executeTakeFirst()
  if (!tpl) return

  const entryId = `recur-entry-${rule.id}-${rule.next_due_at}`
  const op: Op = {
    id: opId,
    hlc: serverHlcFor(rule.next_due_at),
    device_id: 'cron',
    user_id: userId,
    entity_kind: 'money',
    entity_id: entryId,
    op_type: 'create',
    payload: {
      amount: tpl.amount,
      currency: tpl.currency,
      direction: tpl.direction,
      category_id: tpl.category_id,
      description: tpl.description,
      occurred_at: rule.next_due_at,
      source: 'recurring',
      recurring_rule_id: rule.id,
    },
    schema_version: 1,
  }

  await db
    .insertInto('op_log')
    .values({
      id: op.id,
      user_id: userId,
      hlc: op.hlc,
      device_id: op.device_id,
      entity_kind: op.entity_kind,
      entity_id: op.entity_id,
      op_type: op.op_type,
      payload: JSON.stringify(op.payload),
      schema_version: op.schema_version,
      applied_at: Date.now(),
    })
    .execute()

  const merged = applyOp(undefined, op)
  await db
    .insertInto('money_entries')
    .values({
      id: entryId,
      user_id: userId,
      amount: tpl.amount,
      currency: tpl.currency,
      direction: tpl.direction,
      category_id: tpl.category_id,
      description: tpl.description,
      occurred_at: rule.next_due_at,
      source: 'recurring',
      raw_input: null,
      recurring_rule_id: rule.id,
      field_hlcs: JSON.stringify(merged.field_hlcs),
      deleted_at: null,
      created_at: merged.created_at,
      updated_at: merged.updated_at,
    })
    .onConflict(oc => oc.column('id').doNothing())
    .execute()
}

function serverHlcFor(iso: string): string {
  const ms = new Date(iso).getTime().toString().padStart(16, '0')
  return `${ms}-000000-cron`
}
