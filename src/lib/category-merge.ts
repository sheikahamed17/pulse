import type { MoneyEntryRow, RecurringRuleRow, BudgetRow } from '@/lib/dexie'

export type MergeData = { money: MoneyEntryRow[]; recurring: RecurringRuleRow[]; budgets: BudgetRow[] }

export type MergeOp =
  | { entity_kind: 'money'; entity_id: string; op_type: 'update'; payload: { category_id: string } }
  | { entity_kind: 'recurring'; entity_id: string; op_type: 'update'; payload: { category_id: string } }
  | { entity_kind: 'budget'; entity_id: string; op_type: 'delete'; payload: Record<string, never> }
  | { entity_kind: 'budget'; entity_id: string; op_type: 'create' | 'update'; payload: { category_id: string; amount: number; currency: string } }
  | { entity_kind: 'category'; entity_id: string; op_type: 'delete'; payload: Record<string, never> }

/** Ops to reassign every source-category entry (money/recurring/budget) onto the
 *  target and tombstone the source category. Budgets fold to the HIGHER cap.
 *  No-op when source === target. Caller guarantees same kind + distinct. */
export function planCategoryMerge(sourceId: string, targetId: string, data: MergeData): MergeOp[] {
  if (sourceId === targetId) return []
  const ops: MergeOp[] = []

  for (const m of data.money) {
    if (m.category_id === sourceId) ops.push({ entity_kind: 'money', entity_id: m.id, op_type: 'update', payload: { category_id: targetId } })
  }
  for (const r of data.recurring) {
    if (r.category_id === sourceId) ops.push({ entity_kind: 'recurring', entity_id: r.id, op_type: 'update', payload: { category_id: targetId } })
  }

  // Budgets: entity_id === category_id (1:1). Fold onto target keeping the higher cap.
  const srcBudget = data.budgets.find(b => b.category_id === sourceId)
  if (srcBudget) {
    ops.push({ entity_kind: 'budget', entity_id: sourceId, op_type: 'delete', payload: {} })
    const tgtBudget = data.budgets.find(b => b.category_id === targetId)
    const amount = Math.max(srcBudget.amount, tgtBudget?.amount ?? 0)
    const currency = (tgtBudget ?? srcBudget).currency
    ops.push({ entity_kind: 'budget', entity_id: targetId, op_type: tgtBudget ? 'update' : 'create', payload: { category_id: targetId, amount, currency } })
  }

  ops.push({ entity_kind: 'category', entity_id: sourceId, op_type: 'delete', payload: {} })
  return ops
}
