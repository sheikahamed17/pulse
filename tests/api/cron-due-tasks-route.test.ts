/* eslint-disable @typescript-eslint/no-explicit-any */
// Fake DB fixtures use `any` to avoid ~50 lines of recursive generic type definitions.
// Test fixture, not production code — `any` is the right escape valve here.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'

type Row = Record<string, unknown>

function makeFakeDb(opts: {
  tasks?: Row[]
  userPrefs?: Row[]
  notifExists?: (id: string) => boolean
  onInsert?: (table: string, values: Row) => void
}) {
  const chainFor = (table: string) => {
    const wheres: Array<[string, string, unknown]> = []
    const chain: any = {
      where: (col: string, op: string, val: unknown) => {
        wheres.push([col, op, val])
        return chain
      },
      select: () => chain,
      selectAll: () => chain,
      execute: async () => applyWheres(rowsFor(table), wheres),
      executeTakeFirst: async () => {
        if (table === 'push_notifications') {
          const idW = wheres.find(([c]) => c === 'id')
          const id = idW ? String(idW[2]) : ''
          return opts.notifExists?.(id) ? { id } : null
        }
        return applyWheres(rowsFor(table), wheres)[0] ?? null
      },
    }
    return chain
  }
  const rowsFor = (t: string) => t === 'tasks' ? (opts.tasks ?? []) : t === 'user_prefs' ? (opts.userPrefs ?? []) : []
  const applyWheres = (rows: Row[], ws: Array<[string, string, unknown]>) => rows.filter(r =>
    ws.every(([col, op, val]) => {
      if (op === 'is' && val === null) return r[col] == null
      if (op === '<=') return String(r[col] ?? '') <= String(val)
      if (op === '=') return r[col] === val
      return true
    }))
  return {
    selectFrom: chainFor,
    insertInto: (table: string) => ({ values: (v: Row) => ({ execute: async () => { opts.onInsert?.(table, v) } }) }),
  } as unknown as import('kysely').Kysely<import('@/lib/db').DB>
}

const sendPushMock = vi.fn().mockResolvedValue({ sent: 1, pruned: 0 })

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }),
}))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: sendPushMock }))
vi.mock('@/lib/format', () => ({ formatLocalDateTime: (iso: string, tz: string) => `${iso} (${tz})` }))

let currentFakeDb: any

vi.mock('@/lib/db', () => ({
  createDb: () => currentFakeDb,
}))

const { POST } = await import('@/app/api/cron/due-tasks/route')

function cronReq(secret = TEST_SECRET) {
  return new Request('http://x/api/cron/due-tasks', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('/api/cron/due-tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects without auth', async () => {
    const res = await POST(new Request('http://x/api/cron/due-tasks', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('inserts notification rows for due tasks', async () => {
    currentFakeDb = makeFakeDb({
      tasks: [
        {
          id: 'task-1',
          user_id: 'user-1',
          title: 'Review budget',
          due_at: '2026-07-02T14:00:00.000Z',
          completed_at: null,
          deleted_at: null,
        },
      ],
      userPrefs: [
        { user_id: 'user-1', tz: 'Asia/Kolkata' },
      ],
      notifExists: () => false,
      onInsert: () => {},
    })

    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { notified_tasks: number; users_pushed: number }
    expect(body.notified_tasks).toBeGreaterThanOrEqual(1)
  })

  it('skips completed tasks', async () => {
    const insertedRows: Row[] = []
    currentFakeDb = makeFakeDb({
      tasks: [
        {
          id: 'task-1',
          user_id: 'user-1',
          title: 'Done task',
          due_at: '2026-07-01T14:00:00.000Z',
          completed_at: '2026-07-02T10:00:00.000Z',
          deleted_at: null,
        },
      ],
      userPrefs: [{ user_id: 'user-1', tz: 'Asia/Kolkata' }],
      notifExists: () => false,
      onInsert: (table: string, v: Row) => {
        if (table === 'push_notifications') insertedRows.push(v)
      },
    })

    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { notified_tasks: number }
    expect(body.notified_tasks).toBe(0)
    expect(insertedRows).toHaveLength(0)
  })

  it('skips deleted tasks', async () => {
    const insertedRows: Row[] = []
    currentFakeDb = makeFakeDb({
      tasks: [
        {
          id: 'task-1',
          user_id: 'user-1',
          title: 'Deleted task',
          due_at: '2026-07-02T14:00:00.000Z',
          completed_at: null,
          deleted_at: '2026-07-02T09:00:00.000Z',
        },
      ],
      userPrefs: [{ user_id: 'user-1', tz: 'Asia/Kolkata' }],
      notifExists: () => false,
      onInsert: (table: string, v: Row) => {
        if (table === 'push_notifications') insertedRows.push(v)
      },
    })

    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { notified_tasks: number }
    expect(body.notified_tasks).toBe(0)
    expect(insertedRows).toHaveLength(0)
  })

  it('is idempotent: re-running does not insert duplicate notifications', async () => {
    const insertedRows: Row[] = []
    currentFakeDb = makeFakeDb({
      tasks: [{ id: 'task-1', user_id: 'user-1', title: 'Test', due_at: '2026-07-02T14:00:00.000Z', completed_at: null, deleted_at: null }],
      userPrefs: [{ user_id: 'user-1', tz: 'Asia/Kolkata' }],
      notifExists: (id: string) => insertedRows.some(r => r.id === id),
      onInsert: (table: string, v: Row) => {
        if (table === 'push_notifications') insertedRows.push(v)
      },
    })

    // First run: inserts
    const res1 = await POST(cronReq())
    expect(res1.status).toBe(200)
    const body1 = await res1.json() as { notified_tasks: number }
    expect(body1.notified_tasks).toBe(1)

    // Second run: finds existing, skips
    const res2 = await POST(cronReq())
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as { notified_tasks: number }
    expect(body2.notified_tasks).toBe(0)
  })

  it('sends push once per distinct user with new notifications', async () => {
    sendPushMock.mockClear()
    currentFakeDb = makeFakeDb({
      tasks: [
        { id: 'task-1', user_id: 'user-1', title: 'Task A', due_at: '2026-07-02T14:00:00.000Z', completed_at: null, deleted_at: null },
        { id: 'task-2', user_id: 'user-1', title: 'Task B', due_at: '2026-07-02T15:00:00.000Z', completed_at: null, deleted_at: null },
        { id: 'task-3', user_id: 'user-2', title: 'Task C', due_at: '2026-07-02T16:00:00.000Z', completed_at: null, deleted_at: null },
      ],
      userPrefs: [
        { user_id: 'user-1', tz: 'Asia/Kolkata' },
        { user_id: 'user-2', tz: 'UTC' },
      ],
      notifExists: () => false,
      onInsert: () => {},
    })

    const res = await POST(cronReq())
    expect(res.status).toBe(200)

    // Should call sendPushToUser once for user-1, once for user-2 (deduplicated)
    expect(sendPushMock).toHaveBeenCalledTimes(2)
  })

  it('disarms idempotency on due_at edit (new id key)', async () => {
    const insertedRows: Row[] = []
    const taskId = 'task-1'
    const t1 = '2026-07-02T14:00:00.000Z'
    const t2 = '2026-07-03T14:00:00.000Z'

    currentFakeDb = makeFakeDb({
      tasks: [{ id: taskId, user_id: 'user-1', title: 'Test', due_at: t1, completed_at: null, deleted_at: null }],
      userPrefs: [{ user_id: 'user-1', tz: 'Asia/Kolkata' }],
      notifExists: (id: string) => insertedRows.some(r => r.id === id),
      onInsert: (table: string, v: Row) => {
        if (table === 'push_notifications') insertedRows.push(v)
      },
    })

    // First run with due_at=T1
    sendPushMock.mockClear()
    const res1 = await POST(cronReq())
    expect(res1.status).toBe(200)
    const body1 = await res1.json() as { notified_tasks: number }
    expect(body1.notified_tasks).toBe(1)
    // Should have inserted row with id 'due-task-1-2026-07-02T14:00:00.000Z'
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].id).toBe(`due-${taskId}-${t1}`)

    // Simulate task's due_at being edited to T2
    currentFakeDb = makeFakeDb({
      tasks: [{ id: taskId, user_id: 'user-1', title: 'Test', due_at: t2, completed_at: null, deleted_at: null }],
      userPrefs: [{ user_id: 'user-1', tz: 'Asia/Kolkata' }],
      notifExists: (id: string) => insertedRows.some(r => r.id === id),
      onInsert: (table: string, v: Row) => {
        if (table === 'push_notifications') insertedRows.push(v)
      },
    })

    sendPushMock.mockClear()
    const res2 = await POST(cronReq())
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as { notified_tasks: number }
    // Old T1 key still blocks T1, but T2 key is new → inserts
    expect(body2.notified_tasks).toBe(1)
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[1].id).toBe(`due-${taskId}-${t2}`)
  })
})
