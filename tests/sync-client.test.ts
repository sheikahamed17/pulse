import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp, getDeviceId, pushPullOnce } from '@/lib/sync-client'
import type { Op } from '@/types/ops'

describe('sync-client local pipeline', () => {
  beforeEach(async () => { await resetDb() })

  it('generates a unique device id on first call and reuses it', async () => {
    const id1 = await getDeviceId()
    const id2 = await getDeviceId()
    expect(id1).toBe(id2)
    expect(id1.length).toBeGreaterThanOrEqual(8)
  })

  it('generateOp + applyLocalOp persists both op_log and entity row', async () => {
    const op = await generateOp({
      entity_kind: 'widget',
      entity_id: 'w1',
      op_type: 'create',
      payload: { label: 'first' },
      user_id: 'u1',
    })
    await applyLocalOp(op)

    const ops = await db.op_log.toArray()
    expect(ops).toHaveLength(1)

    const widget = await db.widgets.get('w1')
    expect(widget?.label).toBe('first')
  })

  it('generateOp issues strictly monotonically-increasing HLCs', async () => {
    const a = await generateOp({ entity_kind: 'widget', entity_id: 'w1', op_type: 'create', payload: { label: 'a' }, user_id: 'u1' })
    const b = await generateOp({ entity_kind: 'widget', entity_id: 'w2', op_type: 'create', payload: { label: 'b' }, user_id: 'u1' })
    expect(a.hlc < b.hlc).toBe(true)
  })
})

describe('pushPullOnce', () => {
  beforeEach(async () => { await resetDb() })

  it('sends pending ops and applies returned ops', async () => {
    // Arrange: one local op + one "server" op the server returns
    const localOp = await generateOp({ entity_kind: 'widget', entity_id: 'w1', op_type: 'create', payload: { label: 'local' }, user_id: 'u1' })
    await applyLocalOp(localOp)

    const serverOp = {
      id: 'op-from-server',
      hlc: '0000000000999999-000000-server',
      device_id: 'server',
      user_id: 'u1',
      entity_kind: 'widget' as const,
      entity_id: 'w2',
      op_type: 'create' as const,
      payload: { label: 'server' },
      schema_version: 1,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      server_hlc: serverOp.hlc,
      new_ops_from_server: [serverOp],
      applied_ack: [localOp.id],
    })))

    // Act
    await pushPullOnce({ userId: 'u1' })

    // Assert
    const widgets = await db.widgets.toArray()
    expect(widgets.map(w => w.id).sort()).toEqual(['w1', 'w2'])

    fetchSpy.mockRestore()
  })
})

describe('applyLocalOp — Phase 1 entity kinds', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a money_entries row from a money create op', async () => {
    await applyLocalOp({
      id: 'op-m1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm1',
      op_type: 'create',
      payload: {
        amount: 8000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual', description: 'chai',
      },
      schema_version: 1,
    })
    const row = await db.money_entries.get('m1')
    expect(row?.amount).toBe(8000)
    expect(row?.description).toBe('chai')
  })

  it('materializes a category create op', async () => {
    await applyLocalOp({
      id: 'op-c1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'category', entity_id: 'c1',
      op_type: 'create',
      payload: { name: 'Food', kind: 'spend', sort_order: 0, icon: '🍴' },
      schema_version: 1,
    })
    const row = await db.categories.get('c1')
    expect(row?.name).toBe('Food')
    expect(row?.kind).toBe('spend')
  })

  it('materializes a recurring create op', async () => {
    await applyLocalOp({
      id: 'op-r1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'recurring', entity_id: 'r1',
      op_type: 'create',
      payload: {
        amount: 2500000, currency: 'INR', direction: 'out',
        period: 'monthly', interval_count: 1,
        anchor_at: '2026-06-01T00:00:00Z',
        next_due_at: '2026-07-01T00:00:00Z',
        end_condition_kind: 'never',
        is_active: 1,
      },
      schema_version: 1,
    })
    const row = await db.recurring_rules.get('r1')
    expect(row?.period).toBe('monthly')
    expect(row?.next_due_at).toBe('2026-07-01T00:00:00Z')
  })

  it('is idempotent per op.id across all entity kinds', async () => {
    const op = {
      id: 'op-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money' as const, entity_id: 'mDup',
      op_type: 'create' as const,
      payload: {
        amount: 100, currency: 'INR', direction: 'out' as const,
        occurred_at: '2026-06-18T14:30:00Z', source: 'manual' as const,
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.money_entries.count()).toBe(1)
  })
})

describe('applyLocalOp — Phase 2 task entity', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a tasks row from a task create op', async () => {
    await applyLocalOp({
      id: 'op-t1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't1',
      op_type: 'create',
      payload: {
        title: 'call mom',
        due_at: '2026-06-19T15:00:00.000Z',
        priority: 'medium',
        source: 'voice',
      },
      schema_version: 1,
    })
    const row = await db.tasks.get('t1')
    expect(row?.title).toBe('call mom')
    expect(row?.priority).toBe('medium')
    expect(row?.due_at).toBe('2026-06-19T15:00:00.000Z')
  })

  it('toggles completed_at via update op', async () => {
    // Create then complete
    await applyLocalOp({
      id: 'op-t2-create',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't2',
      op_type: 'create',
      payload: { title: 'file taxes', priority: 'high', source: 'manual' },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-t2-complete',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't2',
      op_type: 'update',
      payload: { completed_at: '2026-06-19T15:00:00.000Z' },
      schema_version: 1,
    })
    const row = await db.tasks.get('t2')
    expect(row?.completed_at).toBe('2026-06-19T15:00:00.000Z')
    expect(row?.title).toBe('file taxes')               // preserved across update
  })

  it('un-completes via update with completed_at: null', async () => {
    await applyLocalOp({
      id: 'op-t3-create',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't3',
      op_type: 'create',
      payload: { title: 'x', completed_at: '2026-06-19T00:00:00.000Z', source: 'manual' },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-t3-uncomplete',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't3',
      op_type: 'update',
      payload: { completed_at: null },
      schema_version: 1,
    })
    const row = await db.tasks.get('t3')
    expect(row?.completed_at).toBeNull()
  })

  it('is idempotent on duplicate task op.id', async () => {
    const op = {
      id: 'op-t-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task' as const, entity_id: 'tDup',
      op_type: 'create' as const,
      payload: { title: 'one', source: 'manual' as const },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.tasks.count()).toBe(1)
  })
})

describe('applyLocalOp: insight', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('creates a new insight row from op', async () => {
    const userId = 'user-1'
    const op: Op = {
      id: 'op-insight-1',
      hlc: '1234567890-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: '2026-06-21T18:30:00.000Z',
        ends_at: '2026-06-28T18:30:00.000Z',
        summary: 'Great week!',
        metrics: JSON.stringify({ spend_total: 5000 }),
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    const row = await db.insights.get('insight-1')
    expect(row?.summary).toBe('Great week!')
    expect(row?.user_id).toBe(userId)
  })

  it('updates existing insight (LWW merge)', async () => {
    const userId = 'user-1'
    const op1: Op = {
      id: 'op-1',
      hlc: '1000-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: '2026-06-21T18:30:00.000Z',
        ends_at: '2026-06-28T18:30:00.000Z',
        summary: 'Old summary',
        metrics: '{}',
      },
      schema_version: 1,
    }
    await applyLocalOp(op1)
    const op2: Op = {
      id: 'op-2',
      hlc: '2000-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'update',
      payload: {
        summary: 'Updated summary',
      },
      schema_version: 1,
    }
    await applyLocalOp(op2)
    const row = await db.insights.get('insight-1')
    expect(row?.summary).toBe('Updated summary')
  })

  it('idempotent: duplicate op has no effect', async () => {
    const userId = 'user-1'
    const op: Op = {
      id: 'op-dup',
      hlc: '1000-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: '2026-06-21T18:30:00.000Z',
        ends_at: '2026-06-28T18:30:00.000Z',
        summary: 'First',
        metrics: '{}',
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    const before = await db.op_log.count()
    await applyLocalOp(op)
    const after = await db.op_log.count()
    expect(before).toBe(after)
  })
})
