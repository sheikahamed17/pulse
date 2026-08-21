import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_WIDGET_TYPES, widgetId } from './widgets'

// Import actual db after fake-indexeddb is loaded
import { db } from '@/lib/dexie'

describe('seedDefaultWidgetsIfEmpty', () => {
  const userId = 'test-user-123'
  const SEED_FLAG = 'widgets-seeded-v1'

  beforeEach(async () => {
    // Clear all tables
    await db.widgets.clear()
    await db.op_log.clear()
    await db.sync_meta.clear()
  })

  it('seeds N widgets when user has zero non-deleted widgets', async () => {
    const { seedDefaultWidgetsIfEmpty } = await import('./seed-widgets')

    const result = await seedDefaultWidgetsIfEmpty({ userId })
    expect(result.seeded).toBe(DEFAULT_WIDGET_TYPES.length)

    // Verify flag was set
    const flag = await db.sync_meta.get(SEED_FLAG)
    expect(flag).toBeTruthy()
    expect(flag?.value).toBe('1')

    // Verify widgets were created
    const widgets = await db.widgets.where('user_id').equals(userId).toArray()
    expect(widgets).toHaveLength(DEFAULT_WIDGET_TYPES.length)

    // Verify each widget has the correct properties
    for (let i = 0; i < DEFAULT_WIDGET_TYPES.length; i++) {
      const type = DEFAULT_WIDGET_TYPES[i]
      const expectedId = widgetId(userId, type)
      const widget = widgets.find(w => w.id === expectedId)
      expect(widget).toBeTruthy()
      expect(widget?.type).toBe(type)
      expect(widget?.sort_order).toBe(i)
      expect(widget?.label).toBeNull()
    }
  })

  it('returns 0 when the seed flag is already set', async () => {
    // Set the flag
    await db.sync_meta.put({ key: SEED_FLAG, value: '1' })

    const { seedDefaultWidgetsIfEmpty } = await import('./seed-widgets')

    const result = await seedDefaultWidgetsIfEmpty({ userId })
    expect(result.seeded).toBe(0)

    // Verify no widgets were created
    const widgets = await db.widgets.where('user_id').equals(userId).toArray()
    expect(widgets).toHaveLength(0)
  })

  it('returns 0 when user already has non-deleted widgets', async () => {
    // Create some existing widgets
    await db.widgets.put({
      id: 'existing-widget-1',
      user_id: userId,
      label: 'Existing',
      type: 'spent',
      sort_order: 0,
      field_hlcs: {},
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const { seedDefaultWidgetsIfEmpty } = await import('./seed-widgets')

    const result = await seedDefaultWidgetsIfEmpty({ userId })
    expect(result.seeded).toBe(0)

    // Verify only the existing widget is there
    const widgets = await db.widgets.where('user_id').equals(userId).toArray()
    expect(widgets).toHaveLength(1)
    expect(widgets[0].id).toBe('existing-widget-1')
  })

  it('is idempotent (calling twice returns 0 the second time)', async () => {
    const { seedDefaultWidgetsIfEmpty } = await import('./seed-widgets')

    const result1 = await seedDefaultWidgetsIfEmpty({ userId })
    expect(result1.seeded).toBe(DEFAULT_WIDGET_TYPES.length)

    const result2 = await seedDefaultWidgetsIfEmpty({ userId })
    expect(result2.seeded).toBe(0)

    // Verify only one set of widgets exists
    const widgets = await db.widgets.where('user_id').equals(userId).toArray()
    expect(widgets).toHaveLength(DEFAULT_WIDGET_TYPES.length)
  })
})
