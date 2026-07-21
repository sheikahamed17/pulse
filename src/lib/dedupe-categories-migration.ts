import { db } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import { planCategoryDedupe, type DedupeCat } from '@/lib/category-dedupe'

const FLAG = 'categories-deduped-v1'

/**
 * One-time client-side migration that collapses duplicate categories (from the
 * old random-uuid multi-device seed) onto one canonical id per name, remapping
 * every money/recurring/budget reference and tombstoning the duplicates — all as
 * op-log ops so the change syncs.
 *
 * Runs over Dexie (the source of truth the UI reads; server tables are stale on
 * polluted accounts). Guarded by a sync_meta flag; idempotent (a clean account
 * is a no-op). Safe to retry: canonical creates use deterministic ids and the
 * remaps/tombstones are convergent, so a partial run re-applies cleanly.
 */
export async function runCategoryDedupeOnce({ userId }: { userId: string }): Promise<{ ran: boolean; tombstoned: number }> {
  const done = await db.sync_meta.get(FLAG)
  if (done) return { ran: false, tombstoned: 0 }

  const cats: DedupeCat[] = (await db.categories.where('user_id').equals(userId).toArray())
    .filter(c => !c.deleted_at)
    .map(c => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon ?? null, sort_order: c.sort_order }))

  const plan = planCategoryDedupe(cats, userId)

  if (plan.tombstones.length === 0) {
    await db.sync_meta.put({ key: FLAG, value: new Date().toISOString() })
    return { ran: true, tombstoned: 0 }
  }

  const apply = async (entity_kind: 'category' | 'money' | 'recurring' | 'budget', entity_id: string, op_type: 'create' | 'update' | 'delete', payload: Record<string, unknown>) => {
    const op = await generateOp({ entity_kind, entity_id, op_type, payload, user_id: userId })
    await applyLocalOp(op)
  }

  // 1. Create the canonical categories that don't yet exist.
  for (const c of plan.canonical) {
    await apply('category', c.id, 'create', { name: c.name, kind: c.kind, icon: c.icon, sort_order: c.sort_order })
  }
  // 2. Remap money entries onto the canonical category.
  const money = (await db.money_entries.where('user_id').equals(userId).toArray()).filter(m => !m.deleted_at)
  for (const m of money) {
    const canon = m.category_id ? plan.remap[m.category_id] : undefined
    if (canon) await apply('money', m.id, 'update', { category_id: canon })
  }
  // 3. Remap recurring rules.
  const recurring = (await db.recurring_rules.where('user_id').equals(userId).toArray()).filter(r => !r.deleted_at)
  for (const r of recurring) {
    const canon = r.category_id ? plan.remap[r.category_id] : undefined
    if (canon) await apply('recurring', r.id, 'update', { category_id: canon })
  }
  // 4. Migrate budgets: entity_id === category_id, so re-create on the canonical id.
  const budgets = (await db.budgets.where('user_id').equals(userId).toArray()).filter(b => !b.deleted_at)
  for (const b of budgets) {
    const canon = plan.remap[b.category_id]
    if (canon) {
      await apply('budget', b.id, 'delete', {})
      await apply('budget', canon, 'create', { category_id: canon, amount: b.amount, currency: b.currency })
    }
  }
  // 5. Tombstone the duplicate categories.
  for (const id of plan.tombstones) {
    await apply('category', id, 'delete', {})
  }

  await db.sync_meta.put({ key: FLAG, value: new Date().toISOString() })
  return { ran: true, tombstoned: plan.tombstones.length }
}
