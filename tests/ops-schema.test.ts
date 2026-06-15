import { describe, it, expect } from 'vitest'
import { OpSchema } from '@/types/ops'

describe('Op schema validation', () => {
  const validOp = {
    id: 'op_01HXYZ',
    hlc: '0000000000001700-000000-device-a',
    device_id: 'device-a',
    user_id: 'user_01HXYZ',
    entity_kind: 'widget',
    entity_id: 'w_01HXYZ',
    op_type: 'create',
    payload: { label: 'first widget' },
    schema_version: 1,
  }

  it('accepts a valid op', () => {
    const result = OpSchema.safeParse(validOp)
    expect(result.success).toBe(true)
  })

  it('rejects unknown entity_kind', () => {
    const bad = { ...validOp, entity_kind: 'unknown_kind' }
    expect(OpSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown op_type', () => {
    const bad = { ...validOp, op_type: 'patch' }
    expect(OpSchema.safeParse(bad).success).toBe(false)
  })

  it('requires schema_version to be a positive integer', () => {
    expect(OpSchema.safeParse({ ...validOp, schema_version: 0 }).success).toBe(false)
    expect(OpSchema.safeParse({ ...validOp, schema_version: 1.5 }).success).toBe(false)
  })
})
