import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op, EntityRow } from '@/types/ops'

function isLater(opHlc: string, existingHlc: string | undefined): boolean {
  if (!existingHlc) return true
  return compareHlc(parseHlc(opHlc), parseHlc(existingHlc)) > 0
}

// Derive a consistent ISO timestamp from an HLC (for determinism)
function hlcToIso(hlc: string): string {
  const parsed = parseHlc(hlc)
  return new Date(parsed.physicalMs).toISOString()
}

export function applyOp(existing: EntityRow | undefined, op: Op): EntityRow {
  const now = hlcToIso(op.hlc)

  if (op.op_type === 'create') {
    if (existing) {
      // Treat a duplicate create as an update with the same payload
      return applyUpdate(existing, op, now)
    }
    const row: EntityRow = {
      id: op.entity_id,
      user_id: op.user_id,
      field_hlcs: {},
      deleted_at: null,
      created_at: now,
      updated_at: now,
    }
    for (const [k, v] of Object.entries(op.payload)) {
      row[k] = v
      row.field_hlcs[k] = op.hlc
    }
    return row
  }

  if (op.op_type === 'update') {
    if (!existing) {
      // Update on a missing row: fabricate from the update payload (defensive)
      return applyOp(undefined, { ...op, op_type: 'create' })
    }
    return applyUpdate(existing, op, now)
  }

  // delete
  if (!existing) {
    // Delete on a missing row: synthesize an empty tombstone row so future
    // ops can apply LWW correctly
    return {
      id: op.entity_id,
      user_id: op.user_id,
      field_hlcs: { deleted_at: op.hlc },
      deleted_at: now,
      created_at: now,
      updated_at: now,
    }
  }
  if (!isLater(op.hlc, existing.field_hlcs.deleted_at)) return existing
  return {
    ...existing,
    field_hlcs: { ...existing.field_hlcs, deleted_at: op.hlc },
    deleted_at: now,
    updated_at: now,
  }
}

function applyUpdate(existing: EntityRow, op: Op, now: string): EntityRow {
  const next: EntityRow = { ...existing, field_hlcs: { ...existing.field_hlcs } }
  let mutated = false

  for (const [k, v] of Object.entries(op.payload)) {
    if (isLater(op.hlc, existing.field_hlcs[k])) {
      next[k] = v
      next.field_hlcs[k] = op.hlc
      mutated = true
    }
  }

  // Resurrection: an update with HLC later than deleted_at clears the tombstone
  if (existing.deleted_at && isLater(op.hlc, existing.field_hlcs.deleted_at)) {
    next.deleted_at = null
    next.field_hlcs.deleted_at = op.hlc
    mutated = true
  }

  if (mutated) next.updated_at = now
  return next
}

export function applyOps(existing: EntityRow | undefined, ops: Op[]): EntityRow | undefined {
  // Sort by HLC for deterministic replay
  const sorted = [...ops].sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))
  let row = existing
  const seen = new Set<string>()
  for (const op of sorted) {
    if (seen.has(op.id)) continue   // idempotence on op.id
    seen.add(op.id)
    row = applyOp(row, op)
  }
  return row
}
