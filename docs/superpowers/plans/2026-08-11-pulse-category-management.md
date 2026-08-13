# Category Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `Settings → Categories` into a management UI: create (+icon), rename, edit icon, archive/restore, and merge duplicates (reassigning their entries).

**Architecture:** Client-only. A pure, tested `planCategoryMerge` computes the ops to remap a category's money/recurring/budget entries onto another and tombstone the source; the page issues single-field `update`/`create`/`delete` category ops for the rest. No schema/migration/sync changes.

**Tech Stack:** Next 16 / React 19 / Tailwind 4 / Dexie / vitest.

## Global Constraints

- Client-only. NO schema/migration/sync-contract/entity_kind/dependency/cron changes. All via existing `category`/`money`/`recurring`/`budget` ops.
- Reuse: `generateOp`/`applyLocalOp`/`pushPullOnce` (`@/lib/sync-client`), `useCategories` + `useAllCategories`, `CategoryPayloadSchema` fields (`name` 1–40, `kind` spend|income, `icon` ≤8 nullable, `sort_order` int≥0, `is_archived` 0|1). Partial `update` payloads apply field-wise (LWW).
- **Gate MUST be `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** — all green. (Deploy runs Lint before `wrangler deploy`; vitest does not typecheck.) ESLint `react-hooks/purity`: never `Date.now()` in render/useMemo — use `new Date().getTime()` if needed.
- `git add` only named files (never `-A`/`.`). git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Don't push (controller merges).
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/settings/categories` + `/app` 200 after.

## Row types (verbatim, from `src/lib/dexie.ts`)

- `MoneyEntryRow`: `{ id, user_id, category_id: string|null, deleted_at: string|null, … }`
- `RecurringRuleRow`: `{ id, user_id, category_id: string|null, deleted_at: string|null, … }`
- `BudgetRow`: `{ id /* === category_id */, user_id, category_id: string, amount: number, currency: string, deleted_at: string|null, … }`
- `CategoryRow`: `{ id, user_id, name, kind:'spend'|'income', icon:string|null, sort_order:number, is_archived:number, deleted_at:string|null, … }`

Dexie tables: `db.money_entries`, `db.recurring_rules`, `db.budgets`, `db.categories` — each `.where('user_id').equals(userId).toArray()`.

---

### Task 1: pure `planCategoryMerge` + tests

**Files:**
- Create: `src/lib/category-merge.ts`
- Test: `src/lib/category-merge.test.ts`

**Interfaces:**
- Produces:
  - `type MergeData = { money: MoneyEntryRow[]; recurring: RecurringRuleRow[]; budgets: BudgetRow[] }`
  - `type MergeOp =`
    `{ entity_kind: 'money'; entity_id: string; op_type: 'update'; payload: { category_id: string } }`
    `| { entity_kind: 'recurring'; entity_id: string; op_type: 'update'; payload: { category_id: string } }`
    `| { entity_kind: 'budget'; entity_id: string; op_type: 'delete'; payload: Record<string, never> }`
    `| { entity_kind: 'budget'; entity_id: string; op_type: 'create' | 'update'; payload: { category_id: string; amount: number; currency: string } }`
    `| { entity_kind: 'category'; entity_id: string; op_type: 'delete'; payload: Record<string, never> }`
  - `planCategoryMerge(sourceId: string, targetId: string, data: MergeData): MergeOp[]`

- [ ] **Step 1: Write failing tests** — `src/lib/category-merge.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { planCategoryMerge } from './category-merge'
import type { MoneyEntryRow, RecurringRuleRow, BudgetRow } from '@/lib/dexie'

const money = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'm', user_id: 'u', amount: 100, currency: 'INR', direction: 'out', category_id: null,
  description: null, occurred_at: '', source: 'manual', receipt_key: null, raw_input: null,
  recurring_rule_id: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const budget = (o: Partial<BudgetRow>): BudgetRow => ({
  id: 'b', user_id: 'u', category_id: 'b', amount: 0, currency: 'INR',
  field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const EMPTY = { money: [], recurring: [] as RecurringRuleRow[], budgets: [] as BudgetRow[] }

describe('planCategoryMerge', () => {
  it('remaps money entries from source to target', () => {
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, money: [
      money({ id: 'm1', category_id: 'src' }), money({ id: 'm2', category_id: 'other' }), money({ id: 'm3', category_id: 'src' }),
    ]})
    const moneyOps = ops.filter(o => o.entity_kind === 'money')
    expect(moneyOps.map(o => o.entity_id).sort()).toEqual(['m1', 'm3'])
    expect(moneyOps.every(o => o.op_type === 'update' && (o.payload as any).category_id === 'tgt')).toBe(true)
  })
  it('folds budgets keeping the higher cap and tombstones the source budget', () => {
    // source budget 500, target budget 300 → target ends at 500, source deleted
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, budgets: [
      budget({ id: 'src', category_id: 'src', amount: 500 }), budget({ id: 'tgt', category_id: 'tgt', amount: 300 }),
    ]})
    expect(ops).toContainEqual({ entity_kind: 'budget', entity_id: 'src', op_type: 'delete', payload: {} })
    const tgtBudget = ops.find(o => o.entity_kind === 'budget' && o.entity_id === 'tgt')
    expect(tgtBudget).toMatchObject({ op_type: 'update', payload: { category_id: 'tgt', amount: 500, currency: 'INR' } })
  })
  it('moves a source-only budget onto the target (create)', () => {
    const ops = planCategoryMerge('src', 'tgt', { ...EMPTY, budgets: [budget({ id: 'src', category_id: 'src', amount: 800 })] })
    expect(ops).toContainEqual({ entity_kind: 'budget', entity_id: 'src', op_type: 'delete', payload: {} })
    expect(ops.find(o => o.entity_kind === 'budget' && o.entity_id === 'tgt')).toMatchObject({ op_type: 'create', payload: { category_id: 'tgt', amount: 800, currency: 'INR' } })
  })
  it('always tombstones the source category', () => {
    const ops = planCategoryMerge('src', 'tgt', EMPTY)
    expect(ops).toContainEqual({ entity_kind: 'category', entity_id: 'src', op_type: 'delete', payload: {} })
  })
  it('is a no-op when source === target', () => {
    expect(planCategoryMerge('x', 'x', { ...EMPTY, money: [money({ id: 'm1', category_id: 'x' })] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm fail** — `pnpm test category-merge` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/category-merge.ts`**

```ts
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
```

- [ ] **Step 4: Run tests, confirm pass** — `pnpm test category-merge`.

- [ ] **Step 5: Gate + commit** — `pnpm lint && pnpm typecheck && pnpm test category-merge`; then `git add src/lib/category-merge.ts src/lib/category-merge.test.ts && git commit -m "feat: pure planCategoryMerge (remap entries + fold budgets + tombstone source)"`

---

### Task 2: Categories page CRUD — create(+icon) / rename / icon / archive / restore

**Files:**
- Create: `src/hooks/use-archived-categories.ts`
- Modify: `src/app/settings/categories/page.tsx`

**Interfaces:**
- Consumes: `useCategories`, `useAllCategories`, `generateOp`/`applyLocalOp`/`pushPullOnce`.
- Produces: `useArchivedCategories(userId): CategoryRow[]` — all categories with `is_archived === 1 && !deleted_at`, sorted by `sort_order`.

- [ ] **Step 1: Create `src/hooks/use-archived-categories.ts`**

```ts
'use client'
import { useMemo } from 'react'
import { useAllCategories } from '@/hooks/use-all-categories'
import type { CategoryRow } from '@/lib/dexie'

export function useArchivedCategories(userId: string | undefined): CategoryRow[] {
  const all = useAllCategories(userId)
  return useMemo(
    () => all.filter(c => c.is_archived === 1 && !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order),
    [all],
  )
}
```

- [ ] **Step 2: Rebuild `src/app/settings/categories/page.tsx`** — keep the page structure (header, create form, spend/income sections) and ADD:
  - **Create form:** add an optional icon `<input>` (≤8 chars) next to name; include `icon: iconValue || null` in the create payload (keep `kind` select + `sort_order = count`).
  - **Per active row** (in `CategorySection`): an **Edit** toggle that reveals inline `name` (`<input>` maxLength 40) + `icon` (`<input>` maxLength 8) fields and a Save button → `update { name: trimmedName, icon: icon || null }` op (skip if name empty); keep the existing **Archive** button (`update { is_archived: 1 }`). Each interactive control is a 44px target.
  - **Archived section** (new, collapsible/expandable): render `useArchivedCategories(userId)`; each row shows icon+name + a **Restore** button → `update { is_archived: 0 }`. Hide the section entirely when there are no archived categories.
  - All ops via `generateOp`+`applyLocalOp`+`pushPullOnce({ userId })` (existing pattern in this file).
  - Leave a placeholder/prop seam for the **Merge** action wired in Task 3 (e.g. `onMerge?: (c: CategoryRow) => void` on the row) — do NOT implement merge here.

- [ ] **Step 3: Gate** — `pnpm lint && pnpm typecheck && pnpm build` (page is presentational; no unit test). Manually confirm the file compiles and the create/rename/icon/archive/restore handlers each issue the right op shape (matches `CategoryPayloadSchema`).

- [ ] **Step 4: Commit** — `git add src/hooks/use-archived-categories.ts src/app/settings/categories/page.tsx && git commit -m "feat: category page rename/icon/create-icon/archive/restore + archived section"`

---

### Task 3: Merge UI

**Files:**
- Modify: `src/app/settings/categories/page.tsx`

**Interfaces:**
- Consumes: `planCategoryMerge` + `MergeData` (Task 1); `db.money_entries`/`db.recurring_rules`/`db.budgets` (`@/lib/dexie`); `generateOp`/`applyLocalOp`/`pushPullOnce`.

- [ ] **Step 1: Add merge state + handler** to the page:
  - A `mergingId: string | null` state; the row's **Merge** action sets it, revealing a `<select>` of the OTHER active categories of the SAME kind (exclude self) + a Confirm button (disabled until a target is picked).
  - On confirm, run an async `doMerge(sourceId, targetId)`:
    ```ts
    const [m, r, b] = await Promise.all([
      db.money_entries.where('user_id').equals(userId).toArray(),
      db.recurring_rules.where('user_id').equals(userId).toArray(),
      db.budgets.where('user_id').equals(userId).toArray(),
    ])
    const data = {
      money: m.filter(x => !x.deleted_at),
      recurring: r.filter(x => !x.deleted_at),
      budgets: b.filter(x => !x.deleted_at),
    }
    const ops = planCategoryMerge(sourceId, targetId, data)
    const movedCount = ops.filter(o => o.entity_kind === 'money' || o.entity_kind === 'recurring').length
    for (const op of ops) {
      await applyLocalOp(await generateOp({ entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type, payload: op.payload, user_id: userId }))
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    ```
  - Show a brief inline result ("Merged into <target> — moved N entries") then clear `mergingId`.
- [ ] **Step 2: Guards** — only render Merge when the category's kind has ≥2 active categories; the target `<select>` starts blank and Confirm is disabled until chosen; Merge and the Edit inline form are mutually exclusive per row (opening one closes the other).
- [ ] **Step 3: Gate** — `pnpm lint && pnpm typecheck && pnpm build`.
- [ ] **Step 4: Commit** — `git add src/app/settings/categories/page.tsx && git commit -m "feat: merge categories (reassign entries via planCategoryMerge)"`

---

## Self-review

- **Spec coverage:** create+icon (T2) · rename (T2) · icon (T2) · archive/restore (T2) · merge (T1 pure + T3 UI). No reorder / no hard-delete (per owner). ✓
- **Placeholders:** none — Task 1 is full code + tests; Task 2/3 name exact files, ops, and payload shapes.
- **Type consistency:** `MergeData`/`MergeOp`/`planCategoryMerge` defined in Task 1 and consumed verbatim in Task 3; op payloads match `CategoryPayloadSchema` / money/recurring/budget op shapes.

## Post-merge (owner)

After deploy green + prod 200: Sheik opens `Settings → Categories` on a device and **merges his live dupes** (Bike ×3 → 1, Groceries ×2 → 1), confirming entries moved and the duplicates disappear.
