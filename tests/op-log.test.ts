import { describe, it, expect } from 'vitest'
import { applyOp, applyOps } from '@/lib/op-log'
import type { Op, EntityRow } from '@/types/ops'

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
