import { describe, it, expect } from 'vitest'
import { applyOps } from '@/lib/op-log'
import type { Op } from '@/types/ops'

function mkOp(opts: Partial<Op> & { hlc: string; op_type: Op['op_type']; payload: Record<string, unknown> }): Op {
  return {
    id: opts.id ?? `op_${opts.hlc}`,
    hlc: opts.hlc,
    device_id: opts.device_id ?? 'd1',
    user_id: 'u1',
    entity_kind: 'widget',
    entity_id: 'w1',
    op_type: opts.op_type,
    payload: opts.payload,
    schema_version: 1,
  }
}

describe('two-device convergence', () => {
  it('two devices writing different fields concurrently converge to the same state', () => {
    const d1Op = mkOp({ hlc: '0000000000000010-000000-d1', device_id: 'd1', op_type: 'create', payload: { label: 'init' } })
    // d2 sees d1's create after it has already issued an update on a different field
    const d2Op = mkOp({ hlc: '0000000000000020-000000-d2', device_id: 'd2', op_type: 'update', payload: { color: 'red' } })
    const d1Op2 = mkOp({ hlc: '0000000000000030-000000-d1', device_id: 'd1', op_type: 'update', payload: { size: 'L' } })

    // Device 1 applies in d1, d2, d3 order
    const final1 = applyOps(undefined, [d1Op, d2Op, d1Op2])
    // Device 2 receives in d2, d1, d3 order (different network ordering)
    const final2 = applyOps(undefined, [d2Op, d1Op, d1Op2])

    // With byte-perfect determinism from T13, no need to strip created_at/updated_at
    expect(final1).toEqual(final2)
    expect(final1?.label).toBe('init')
    expect(final1?.color).toBe('red')
    expect(final1?.size).toBe('L')
  })

  it('same field written by two devices: higher HLC wins regardless of arrival order', () => {
    const d1 = mkOp({ hlc: '0000000000000010-000000-d1', device_id: 'd1', op_type: 'create', payload: { label: 'd1-label' } })
    const d2 = mkOp({ hlc: '0000000000000020-000000-d2', device_id: 'd2', op_type: 'update', payload: { label: 'd2-label' } })

    const order1 = applyOps(undefined, [d1, d2])
    const order2 = applyOps(undefined, [d2, d1])

    expect(order1?.label).toBe('d2-label')
    expect(order2?.label).toBe('d2-label')
  })
})
