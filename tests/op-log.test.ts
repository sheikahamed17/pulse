import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { applyOp, applyOps } from '@/lib/op-log'
import { serializeHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

const baseOp: Omit<Op, 'hlc' | 'op_type' | 'payload'> = {
  id: 'op1',
  device_id: 'd1',
  user_id: 'u1',
  entity_kind: 'widget',
  entity_id: 'w1',
  schema_version: 1,
}

const mk = (hlc: string, op_type: Op['op_type'], payload: Record<string, unknown>, id = `op_${hlc}`): Op => ({
  ...baseOp,
  id,
  hlc,
  op_type,
  payload,
})

describe('applyOp — create', () => {
  it('creates a row when no existing row', () => {
    const row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    expect(row.id).toBe('w1')
    expect(row.label).toBe('A')
    expect(row.field_hlcs.label).toBe('0000000000000001-000000-d1')
    expect(row.deleted_at).toBeNull()
  })
})

describe('applyOp — update with per-field LWW', () => {
  it('applies later-HLC update', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'update', { label: 'B' }, 'op2'))
    expect(row.label).toBe('B')
    expect(row.field_hlcs.label).toBe('0000000000000002-000000-d1')
  })

  it('ignores earlier-HLC update on the same field', () => {
    let row = applyOp(undefined, mk('0000000000000002-000000-d1', 'create', { label: 'B' }))
    row = applyOp(row, mk('0000000000000001-000000-d1', 'update', { label: 'A' }, 'op2'))
    expect(row.label).toBe('B')
    expect(row.field_hlcs.label).toBe('0000000000000002-000000-d1')
  })

  it('applies later-HLC update only to the field it touches', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A', color: 'red' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'update', { color: 'blue' }, 'op2'))
    expect(row.label).toBe('A')
    expect(row.color).toBe('blue')
    expect(row.field_hlcs.label).toBe('0000000000000001-000000-d1')
    expect(row.field_hlcs.color).toBe('0000000000000002-000000-d1')
  })
})

describe('applyOp — delete (tombstone) and resurrect', () => {
  it('marks deleted_at on delete', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'delete', {}, 'op2'))
    expect(row.deleted_at).not.toBeNull()
    expect(row.field_hlcs.deleted_at).toBe('0000000000000002-000000-d1')
  })

  it('resurrects when a later op writes a field', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'delete', {}, 'op2'))
    row = applyOp(row, mk('0000000000000003-000000-d1', 'update', { label: 'B' }, 'op3'))
    // Resurrection: a write after a delete brings the row back if op.hlc > deleted_at hlc
    // Convention: an explicit update after a delete restores deleted_at to null with the same HLC
    expect(row.deleted_at).toBeNull()
    expect(row.label).toBe('B')
  })
})

describe('applyOps — multi-op replay', () => {
  it('order-independent (commutative for independent fields)', () => {
    const ops: Op[] = [
      mk('0000000000000001-000000-d1', 'create', { label: 'A' }, 'op1'),
      mk('0000000000000002-000000-d2', 'update', { color: 'red' }, 'op2'),
      mk('0000000000000003-000000-d1', 'update', { size: 'L' }, 'op3'),
    ]
    const a = applyOps(undefined, ops)
    const b = applyOps(undefined, [ops[2], ops[0], ops[1]])
    expect(a).toEqual(b)
  })

  it('idempotent (applying the same op twice has no effect)', () => {
    const ops: Op[] = [mk('0000000000000001-000000-d1', 'create', { label: 'A' }, 'op1')]
    const a = applyOps(undefined, ops)
    const b = applyOps(a, ops)
    expect(a).toEqual(b)
  })
})

describe('op-log properties', () => {
  const hlcArb = fc.record({
    physicalMs: fc.integer({ min: 1, max: 1_000_000 }),
    logical: fc.integer({ min: 0, max: 100 }),
    deviceId: fc.stringMatching(/^[a-z]{1,4}$/),
  }).map(serializeHlc)

  const fieldArb = fc.constantFrom('label', 'color', 'size')
  const valueArb = fc.string({ minLength: 1, maxLength: 8 })
  const payloadArb = fc.dictionary(fieldArb, valueArb, { minKeys: 1, maxKeys: 3 })

  const opTypeArb = fc.constantFrom<Op['op_type']>('create', 'update', 'delete')

  const opArb: fc.Arbitrary<Op> = fc.record({
    id: fc.uuid(),
    hlc: hlcArb,
    device_id: fc.stringMatching(/^[a-z]{1,4}$/),
    user_id: fc.constant('u1'),
    entity_kind: fc.constant('widget'),
    entity_id: fc.constant('w1'),
    op_type: opTypeArb,
    payload: payloadArb,
    schema_version: fc.constant(1),
  }) as fc.Arbitrary<Op>

  it('order-independent: any permutation of the same op set yields the same row', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 2, maxLength: 20 }), ops => {
        const a = applyOps(undefined, ops)
        const shuffled = [...ops].sort(() => 0.5 - Math.random())
        const b = applyOps(undefined, shuffled)
        expect(a).toEqual(b)
      }),
      { numRuns: 200 }
    )
  })

  it('idempotent: applying the same op set twice equals applying once', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 10 }), ops => {
        const a = applyOps(undefined, ops)
        const b = applyOps(a, ops)
        expect(a).toEqual(b)
      }),
      { numRuns: 200 }
    )
  })
})
