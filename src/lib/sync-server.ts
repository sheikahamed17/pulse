import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

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
