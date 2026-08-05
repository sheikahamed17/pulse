import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

export type MergeResult = {
  newOps: Op[]              // ops we should insert into op_log
  opsForClient: Op[]        // ops the client should apply
}

/** Dedup: which incoming ops the server does not already have (by id). */
export function filterNewOps(incomingOps: Op[], existingIds: Set<string>): Op[] {
  return incomingOps.filter(o => !existingIds.has(o.id))
}

/** The ops a client is missing: filter to hlc > cursor (if given), sorted by HLC. */
export function orderOpsAfter(ops: Op[], cursor?: string): Op[] {
  const filtered = cursor
    ? ops.filter(o => compareHlc(parseHlc(o.hlc), parseHlc(cursor)) > 0)
    : ops
  return [...filtered].sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))
}

export function mergeOpsForUser(
  existingOpsForUser: Op[],
  incomingOps: Op[],
  lastSyncedHlc?: string,
): MergeResult {
  const existingIds = new Set(existingOpsForUser.map(o => o.id))
  const newOps = incomingOps.filter(o => !existingIds.has(o.id))

  const allKnown = [...existingOpsForUser, ...newOps]
  const opsForClient = lastSyncedHlc
    ? allKnown.filter(o => compareHlc(parseHlc(o.hlc), parseHlc(lastSyncedHlc)) > 0)
    : allKnown
  opsForClient.sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))

  return { newOps, opsForClient }
}
