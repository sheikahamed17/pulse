import { db } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import type { WidgetPayload } from '@/lib/op-schemas/widget'
import { DEFAULT_WIDGET_TYPES, widgetId } from '@/lib/widgets'

const SEED_FLAG = 'widgets-seeded-v1'

export async function seedDefaultWidgetsIfEmpty({ userId }: { userId: string }): Promise<{ seeded: number }> {
  // Check if already seeded
  const seedFlag = await db.sync_meta.get(SEED_FLAG)
  if (seedFlag) return { seeded: 0 }

  // Check if user has any non-deleted widgets
  const existing = await db.widgets
    .where('user_id')
    .equals(userId)
    .toArray()
  const nonDeleted = existing.filter(w => !w.deleted_at)
  if (nonDeleted.length > 0) return { seeded: 0 }

  // Seed default widgets
  let seeded = 0
  for (let i = 0; i < DEFAULT_WIDGET_TYPES.length; i++) {
    const type = DEFAULT_WIDGET_TYPES[i]
    const payload: WidgetPayload = {
      type,
      sort_order: i,
      label: null,
    }
    const op = await generateOp({
      entity_kind: 'widget',
      entity_id: widgetId(userId, type),
      op_type: 'create',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    seeded++
  }

  // Set the seed flag
  await db.sync_meta.put({ key: SEED_FLAG, value: '1' })

  return { seeded }
}
