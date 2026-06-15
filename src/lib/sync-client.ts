import { db } from '@/lib/dexie'
import { applyOp } from '@/lib/op-log'
import { createHlc, parseHlc, serializeHlc, tickHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

function newDeviceId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

const SCHEMA_VERSION = 1

export async function getDeviceId(): Promise<string> {
  const row = await db.sync_meta.get('device_id')
  if (row) return row.value
  const id = newDeviceId()
  await db.sync_meta.put({ key: 'device_id', value: id })
  return id
}

async function readLocalHlc(deviceId: string) {
  const row = await db.sync_meta.get('local_hlc')
  if (row) return parseHlc(row.value)
  return createHlc(deviceId, Date.now())
}

async function writeLocalHlc(hlcStr: string) {
  await db.sync_meta.put({ key: 'local_hlc', value: hlcStr })
}

export async function generateOp(input: {
  entity_kind: Op['entity_kind']
  entity_id: string
  op_type: Op['op_type']
  payload: Record<string, unknown>
  user_id: string
}): Promise<Op> {
  const deviceId = await getDeviceId()
  const prev = await readLocalHlc(deviceId)
  const next = tickHlc(prev, Date.now())
  await writeLocalHlc(serializeHlc(next))

  return {
    id: crypto.randomUUID(),
    hlc: serializeHlc(next),
    device_id: deviceId,
    user_id: input.user_id,
    entity_kind: input.entity_kind,
    entity_id: input.entity_id,
    op_type: input.op_type,
    payload: input.payload,
    schema_version: SCHEMA_VERSION,
  }
}

export async function applyLocalOp(op: Op): Promise<void> {
  // Idempotent: if already in op_log, no-op
  const existing = await db.op_log.get(op.id)
  if (existing) return

  await db.transaction('rw', [db.op_log, db.widgets], async () => {
    await db.op_log.add(op)
    if (op.entity_kind === 'widget') {
      const current = await db.widgets.get(op.entity_id)
      const next = applyOp(current, op)
      await db.widgets.put(next)
    }
    // Other entity_kind branches added in later phases
  })
}
