/* eslint-disable @typescript-eslint/no-explicit-any */
// The mock Kysely chain is generic + recursive; typing each call site
// precisely would be ~50 lines of fixture-only type definitions. Test
// fixture, not production code — `any` is the right escape valve here.
import { describe, it, expect, vi } from 'vitest'
import { applyOps } from '@/lib/op-log'
import type { Op } from '@/types/ops'

// Mock auth and Cloudflare context for integration tests
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      DB: { /* mock D1 */ },
      BETTER_AUTH_SECRET: 'test-secret-32-chars-minimum!!!',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  })),
}))

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(async (_req: Request) => {
    // Extract userId from request context (injected by test harness)
    const auth = (globalThis as any).__testAuth
    return auth ? { user: { id: auth.userId } } : null
  }),
}))

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

// ===== Test Harness for /api/sync integration tests =====
// In-memory mock database for testing server-side materialization.

interface DbTable {
  [key: string]: Record<string, unknown>[]
}

let mockDbInstance: DbTable = {}

function resetMockDb() {
  mockDbInstance = {
    op_log: [],
    widgets: [],
    categories: [],
    money_entries: [],
    recurring_rules: [],
  }
}

// Mock query builder for sync-integration tests
class MockQueryBuilder {
  private tableName: string
  private whereConditions: Array<[string, string, unknown]> = []
  private selectAllMode = false

  constructor(tableName: string) {
    this.tableName = tableName
  }

  selectFrom(name: string) {
    this.tableName = name
    return this
  }

  where(col: string, op: string, val: unknown) {
    this.whereConditions.push([col, op, val])
    return this
  }

  selectAll() {
    this.selectAllMode = true
    return this
  }

  async execute() {
    const table = mockDbInstance[this.tableName] || []
    let filtered = [...table]

    for (const [col, op, val] of this.whereConditions) {
      filtered = filtered.filter(row => {
        if (op === '=') return row[col] === val
        return true
      })
    }

    return filtered
  }

  async executeTakeFirst() {
    const results = await this.execute()
    return results[0] || null
  }
}

class MockDb {
  selectFrom(name: string) {
    return new MockQueryBuilder(name)
  }

  insertInto(name: string) {
    return {
      values: (row: Record<string, unknown>) => {
        return {
          onConflict: (fn: (oc: any) => any) => {
            // Mock the conflict builder
            const oc = {
              column: (_col: string) => {
                return {
                  doUpdateSet: (updates: Record<string, unknown>) => {
                    return {
                      async execute() {
                        // Simple upsert: find by id and update, else insert
                        const table = mockDbInstance[name] || []
                        const idx = table.findIndex(r => r.id === row.id)
                        if (idx >= 0) {
                          table[idx] = { ...table[idx], ...updates }
                        } else {
                          table.push(row)
                        }
                        mockDbInstance[name] = table
                      }
                    }
                  }
                }
              }
            }
            // Call the function with mock oc
            const result = fn(oc)
            return result
          },
          async execute() {
            // Simple insert without conflict handling
            const table = mockDbInstance[name] || []
            const idx = table.findIndex(r => r.id === row.id)
            if (idx >= 0) {
              table[idx] = { ...table[idx], ...row }
            } else {
              table.push(row)
            }
            mockDbInstance[name] = table
          }
        }
      }
    }
  }
}

function createMockKysely() {
  return new MockDb()
}

// Mock createDb to return our mock
vi.mock('@/lib/db', () => ({
  createDb: vi.fn(() => createMockKysely()),
}))

async function withTestUser(
  fn: (opts: {
    userId: string
    callSync: (payload: any) => Promise<any>
    testDb: MockDb
  }) => Promise<void>,
) {
  resetMockDb()
  const userId = 'test-user-' + Math.random().toString(36).slice(2, 8)

  // Set auth context for this user
  ;(globalThis as any).__testAuth = { userId }

  // Import route (it's mocked to use our mock db)
  const { POST } = await import('../src/app/api/sync/route')

  const callSync = async (payload: any) => {
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(req)
    const data = await response.json()
    return data
  }

  const testDb = createMockKysely()

  try {
    await fn({
      userId,
      callSync,
      testDb,
    })
  } finally {
    ;(globalThis as any).__testAuth = null
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

describe('/api/sync — Phase 1 entity kinds', () => {
  it('persists a money entry and includes it in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-m1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'money',
        entity_id: 'm1',
        op_type: 'create' as const,
        payload: {
          amount: 8000,
          currency: 'INR',
          direction: 'out' as const,
          occurred_at: '2026-06-18T14:30:00Z',
          source: 'manual' as const,
          description: 'chai',
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-m1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('money')

      const rows = await testDb.selectFrom('money_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].amount).toBe(8000)
    })
  })

  it('persists a category entry', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-c1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'category',
        entity_id: 'c1',
        op_type: 'create' as const,
        payload: { name: 'Food', kind: 'spend' as const, sort_order: 0, icon: '🍴' },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op] })
      const rows = await testDb.selectFrom('categories').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe('Food')
    })
  })

  it('persists a recurring rule', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-r1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'recurring',
        entity_id: 'r1',
        op_type: 'create' as const,
        payload: {
          amount: 2500000,
          currency: 'INR',
          direction: 'out' as const,
          period: 'monthly' as const,
          interval_count: 1,
          anchor_at: '2026-06-01T00:00:00Z',
          next_due_at: '2026-07-01T00:00:00Z',
          end_condition_kind: 'never' as const,
          is_active: 1,
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op] })
      const rows = await testDb.selectFrom('recurring_rules').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].period).toBe('monthly')
      expect(rows[0].next_due_at).toBe('2026-07-01T00:00:00Z')
    })
  })
})
