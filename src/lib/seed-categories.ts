import { db } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import type { CategoryPayload } from '@/lib/op-schemas/category'

type SeedCategory = Omit<CategoryPayload, 'sort_order'>

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Food',           kind: 'spend',  icon: '🍴' },
  { name: 'Transport',      kind: 'spend',  icon: '🚗' },
  { name: 'Rent',           kind: 'spend',  icon: '🏠' },
  { name: 'Bills',          kind: 'spend',  icon: '💡' },
  { name: 'Shopping',       kind: 'spend',  icon: '🛍️' },
  { name: 'Entertainment',  kind: 'spend',  icon: '🎬' },
  { name: 'Health',         kind: 'spend',  icon: '🏥' },
  { name: 'Personal',       kind: 'spend',  icon: '👤' },
  { name: 'Misc',           kind: 'spend',  icon: '⋯' },
  { name: 'Salary',         kind: 'income', icon: '💼' },
  { name: 'Freelance',      kind: 'income', icon: '💻' },
  { name: 'Refund',         kind: 'income', icon: '↩️' },
  { name: 'Investment',     kind: 'income', icon: '📈' },
  { name: 'Gift',           kind: 'income', icon: '🎁' },
]

export async function seedDefaultCategoriesIfEmpty({ userId }: { userId: string }): Promise<number> {
  const existing = await db.categories.where('user_id').equals(userId).count()
  if (existing > 0) return 0

  let inserted = 0
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i]
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: { ...cat, sort_order: i },
      user_id: userId,
    })
    await applyLocalOp(op)
    inserted++
  }
  return inserted
}
