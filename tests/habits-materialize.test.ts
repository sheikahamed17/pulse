/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { materializeRow } from '@/lib/materialize'
import type { Op } from '@/types/ops'

describe('habit + habit_log materializeRow (server-side)', () => {
  let insertedRows: Record<string, unknown>[] = []
  let existingRows: Map<string, Record<string, unknown>> = new Map()

  const mockDb = {
    selectFrom: (table: string) => {
      const b: any = {
        where: (col: string, op: string, val: unknown) => {
          if (col === 'id' && op === '=' && typeof val === 'string') {
            const row = existingRows.get(`${table}:${val}`)
            b._existing = row
          }
          return b
        },
        selectAll: () => b,
        executeTakeFirst: async () => b._existing,
      }
      return b
    },
    insertInto: (table: string) => {
      const b: any = {
        values: (row: Record<string, unknown>) => {
          b._row = { ...row, _table: table }
          return b
        },
        onConflict: (fn: (oc: any) => void) => {
          const oc: any = {
            column: (col: string) => {
              oc._col = col
              return oc
            },
            doUpdateSet: (updates: Record<string, unknown>) => {
              oc._updates = updates
              return oc
            },
          }
          fn(oc)
          return b
        },
        execute: async () => {
          insertedRows.push(b._row)
          const key = `${b._row._table}:${b._row.id}`
          existingRows.set(key, b._row)
        },
      }
      return b
    },
  } as any

  beforeEach(() => {
    insertedRows = []
    existingRows = new Map()
  })

  it('habit: CREATE op materializes to server D1 habits table', async () => {
    const op: Op = {
      id: 'op1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1',
      user_id: 'u1',
      entity_kind: 'habit',
      entity_id: 'h1',
      op_type: 'create',
      payload: { name: 'Meditate', icon: '🧘', is_archived: 0 },
      schema_version: 1,
    }

    await materializeRow(mockDb, op, 'u1')

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row._table).toBe('habits')
    expect(row.id).toBe('h1')
    expect(row.user_id).toBe('u1')
    expect(row.name).toBe('Meditate')
    expect(row.icon).toBe('🧘')
    expect(row.is_archived).toBe(0)
    expect(row.field_hlcs).toBeDefined()
    expect(row.deleted_at).toBeNull()
    expect(row.created_at).toBeDefined()
    expect(row.updated_at).toBeDefined()
  })

  it('habit_log: CREATE op materializes to server D1 habit_logs table', async () => {
    const op: Op = {
      id: 'op2',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1',
      user_id: 'u1',
      entity_kind: 'habit_log',
      entity_id: 'hlog-h1-2026-08-22',
      op_type: 'create',
      payload: { habit_id: 'h1', day: '2026-08-22' },
      schema_version: 1,
    }

    await materializeRow(mockDb, op, 'u1')

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row._table).toBe('habit_logs')
    expect(row.id).toBe('hlog-h1-2026-08-22')
    expect(row.user_id).toBe('u1')
    expect(row.habit_id).toBe('h1')
    expect(row.day).toBe('2026-08-22')
    expect(row.field_hlcs).toBeDefined()
    expect(row.deleted_at).toBeNull()
  })

  it('habit_log: DELETE op sets deleted_at on server', async () => {
    // First create the habit_log
    const createOp: Op = {
      id: 'op1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1',
      user_id: 'u1',
      entity_kind: 'habit_log',
      entity_id: 'hlog-h1-2026-08-22',
      op_type: 'create',
      payload: { habit_id: 'h1', day: '2026-08-22' },
      schema_version: 1,
    }

    await materializeRow(mockDb, createOp, 'u1')
    expect(insertedRows).toHaveLength(1)
    expect((insertedRows[0] as any).deleted_at).toBeNull()

    // Now delete it
    insertedRows = []
    const deleteOp: Op = {
      id: 'op2',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1',
      user_id: 'u1',
      entity_kind: 'habit_log',
      entity_id: 'hlog-h1-2026-08-22',
      op_type: 'delete',
      payload: {},
      schema_version: 1,
    }

    await materializeRow(mockDb, deleteOp, 'u1')

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.deleted_at).toBeDefined()
    expect(row.deleted_at).not.toBeNull()
  })

  it('habit: UPDATE op changes only touched field via per-field LWW', async () => {
    // First create
    const createOp: Op = {
      id: 'op1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1',
      user_id: 'u1',
      entity_kind: 'habit',
      entity_id: 'h1',
      op_type: 'create',
      payload: { name: 'Meditate', icon: '🧘' },
      schema_version: 1,
    }

    await materializeRow(mockDb, createOp, 'u1')
    const created = insertedRows[0]
    existingRows.set('habits:h1', created)

    // Now update the name
    insertedRows = []
    const updateOp: Op = {
      id: 'op2',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1',
      user_id: 'u1',
      entity_kind: 'habit',
      entity_id: 'h1',
      op_type: 'update',
      payload: { name: 'Run' },
      schema_version: 1,
    }

    await materializeRow(mockDb, updateOp, 'u1')

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.name).toBe('Run')
    expect(row.icon).toBe('🧘') // unchanged
  })
})
