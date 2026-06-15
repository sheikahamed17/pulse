import { describe, it, expect } from 'vitest'
import { mergeOpsForUser } from '@/lib/sync-server'
import type { Op } from '@/types/ops'

const mkOp = (id: string, hlc: string, payload: Record<string, unknown>): Op => ({
  id, hlc,
  device_id: 'd1', user_id: 'u1',
  entity_kind: 'widget', entity_id: 'w1',
  op_type: 'update',
  payload,
  schema_version: 1,
})

describe('mergeOpsForUser', () => {
  it('deduplicates by op.id', () => {
    const incoming = [mkOp('a', '0000000000000001-000000-d1', { label: 'A' })]
    const existing = [mkOp('a', '0000000000000001-000000-d1', { label: 'A' })]
    const result = mergeOpsForUser(existing, incoming)
    expect(result.newOps).toHaveLength(0)
  })

  it('keeps only ops whose id is not already in existing', () => {
    const existing = [mkOp('a', '0000000000000001-000000-d1', { label: 'A' })]
    const incoming = [
      mkOp('a', '0000000000000001-000000-d1', { label: 'A' }),
      mkOp('b', '0000000000000002-000000-d1', { label: 'B' }),
    ]
    const result = mergeOpsForUser(existing, incoming)
    expect(result.newOps).toHaveLength(1)
    expect(result.newOps[0].id).toBe('b')
  })

  it('returns ops the client does not have yet (hlc > last_synced_hlc)', () => {
    const existing = [
      mkOp('a', '0000000000000001-000000-d1', { label: 'A' }),
      mkOp('b', '0000000000000003-000000-d1', { label: 'B' }),
    ]
    const result = mergeOpsForUser(existing, [], '0000000000000002-000000-d1')
    expect(result.opsForClient.map(o => o.id)).toEqual(['b'])
  })

  it('opsForClient is sorted by HLC', () => {
    const existing: Op[] = [
      mkOp('a', '0000000000000003-000000-d1', { label: 'A' }),
      mkOp('b', '0000000000000001-000000-d1', { label: 'B' }),
      mkOp('c', '0000000000000002-000000-d1', { label: 'C' }),
    ]
    const result = mergeOpsForUser(existing, [])
    expect(result.opsForClient.map(o => o.id)).toEqual(['b', 'c', 'a'])
  })
})
