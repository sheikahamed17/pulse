import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp, getDeviceId, pushPullOnce } from '@/lib/sync-client'

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
