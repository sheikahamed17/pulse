# Pulse — Category management UI (design)

**Date:** 2026-08-11
**Status:** approved for planning

## Problem

`Settings → Categories` (`src/app/settings/categories/page.tsx`) can only **create** (name + kind) and **archive** (one-way `is_archived → 1`). There's no rename, no icon editing, no un-archive, and — most importantly — no way to **merge duplicates**. Sheik has real live duplicate categories (Bike ×3, Groceries ×2) from the old multi-device seed; the recent breakdown fix makes them *display* merged, but the underlying rows remain, cluttering pickers and the category list. Users (and self-hosting friends) need direct control over their categories.

## Goals

Rebuild the Categories page into a management UI supporting:
1. **Create** — name + kind + optional icon (today: no icon).
2. **Rename** — edit a category's name.
3. **Edit icon** — set/clear a category's emoji.
4. **Archive / Restore** — toggle `is_archived`; today archive is one-way with no visibility of archived categories.
5. **Merge** — reassign ALL of a category's money/recurring/budget entries onto another same-kind category, then tombstone the source. This is the duplicate-killer.

## Non-goals (YAGNI, per owner)

- **No reorder** (sort_order editing) in this slice.
- **No hard-delete** — archive hides a category (kept for labeling), merge reassigns its entries. (A standalone delete of a category that still has entries would keep showing its name in breakdowns, since name resolution now spans all categories — so delete is deliberately omitted.)
- **No `kind` change** (moving a category spend↔income reclassifies its entries; out of scope).
- No schema/migration/sync-contract/entity_kind/dependency/cron changes — everything is expressed via existing `category`/`money`/`recurring`/`budget` ops (client-only, like the current archive button).

## Architecture

### Part 1 — pure `planCategoryMerge` (correctness-critical)

The remap logic already exists inside `runCategoryDedupeOnce` (`src/lib/dedupe-categories-migration.ts`, steps 2–5). Extract the single-source→target case into a pure, tested helper:

`src/lib/category-merge.ts`
- `type MergeData = { money: MoneyEntryRow[]; recurring: RecurringRuleRow[]; budgets: BudgetRow[] }` (each list = the user's non-deleted rows)
- `type MergeOp` — a discriminated union of the ops to apply:
  - `{ entity_kind: 'money'; entity_id; op_type: 'update'; payload: { category_id: string } }`
  - `{ entity_kind: 'recurring'; entity_id; op_type: 'update'; payload: { category_id: string } }`
  - `{ entity_kind: 'budget'; entity_id; op_type: 'delete'; payload: {} }`
  - `{ entity_kind: 'budget'; entity_id; op_type: 'create' | 'update'; payload: { category_id: string; amount: number; currency: string } }`
  - `{ entity_kind: 'category'; entity_id; op_type: 'delete'; payload: {} }`
- `planCategoryMerge(sourceId: string, targetId: string, data: MergeData): MergeOp[]`

Logic (mirrors the migration's proven handling):
- Guard: `sourceId === targetId` → return `[]`.
- **money**: each entry with `category_id === sourceId` → an `update {category_id: targetId}` op.
- **recurring**: same.
- **budgets** (entity_id === category_id, 1:1): if a source budget exists, fold into target — winner amount = `max(sourceBudget.amount, existingTargetBudget?.amount ?? 0)` (a budget is a cap; never silently lower it); emit `delete` for the source budget, and `create` (or `update` if a target budget already exists) for the target with the winner amount + currency.
- **category**: `delete` the source (tombstone).

The **caller** guarantees source ≠ target and same `kind` (enforced in the UI: the merge picker only lists other active categories of the same kind).

### Part 2 — Categories page CRUD (create+icon / rename / icon / archive / restore)

Rebuild `src/app/settings/categories/page.tsx`:
- **Create form:** name + kind `<select>` + optional icon input → `create` op with `{ name, kind, icon, sort_order }` (sort_order = current count of that kind, as today).
- **Active list** (per kind, via `useCategories`): each row shows icon + name and a small action set:
  - **Edit** (rename + icon inline): toggles an inline editor (name `<input>` 1–40, icon `<input>` ≤8) → `update { name, icon }` op.
  - **Merge** (Part 3).
  - **Archive** → `update { is_archived: 1 }` (existing behavior).
- **Archived section** (collapsible), sourced from all categories with `is_archived === 1 && !deleted_at` (via a small hook over `useAllCategories`): each row → **Restore** → `update { is_archived: 0 }`.
- All writes go through `generateOp` + `applyLocalOp` + `pushPullOnce` (the existing pattern on this page).

### Part 3 — Merge UI

- Each active row's **Merge** action opens a picker: a `<select>` of the OTHER active categories of the SAME kind (excludes self). Confirm → read fresh non-deleted `money_entries` / `recurring_rules` / `budgets` for the user from Dexie, compute `planCategoryMerge(sourceId, targetId, data)`, apply each returned op via `generateOp`+`applyLocalOp`, then one `pushPullOnce`.
- Feedback: after merge, show a brief inline result ("Merged _Bike_ into _🏍️ Bike_ — moved N entries"). The source disappears from the active list (tombstoned); its entries now resolve to the target.
- Guard against empty target selection; disable Merge when a kind has only one category.

## Data flow

```
create/rename/icon/archive/restore:  one category update/create op → applyLocalOp → pushPullOnce
merge:  read fresh {money,recurring,budgets} from Dexie
        → planCategoryMerge(source,target,data)  [pure]
        → apply each op (money/recurring remap, budget fold, source tombstone)
        → pushPullOnce
```

## Correctness invariants (tested)

1. **No entry loss on merge:** every money/recurring entry on `sourceId` becomes an update to `targetId`; counts preserved; amounts untouched.
2. **Budget fold:** merging never lowers a cap — target budget ends at `max(source, target)`; source budget is tombstoned; if only the source had a budget, the target gains it.
3. **Source tombstoned:** exactly one `category delete` op for `sourceId`; target untouched as a category.
4. **No-op guard:** `planCategoryMerge(x, x, …)` → `[]`.
5. **Client-only:** no op kinds beyond the existing category/money/recurring/budget ops; no schema/sync change; existing sync/materialize + dedupe-migration tests stay green.

## Testing

- **Pure:** `planCategoryMerge` — money remap, recurring remap, budget fold (source>target, target>source, source-only, neither), source tombstone, no-op guard. Unit-tested (`src/lib/category-merge.test.ts`).
- **Page** is presentational → `pnpm lint` + `pnpm typecheck` + `pnpm build` + a QA runbook (rename, icon, archive, restore, merge two dupes, verify entries moved).
- Full **gate**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green; **opus whole-branch review**.

## Global constraints

- **Client-only; no schema/migration/sync-contract/entity_kind/dependency/cron changes.** All via existing ops.
- Reuse existing patterns: `generateOp`/`applyLocalOp`/`pushPullOnce`, `useCategories`, `useAllCategories`, `CategoryPayloadSchema` fields (`name` 1–40, `kind`, `icon` ≤8, `sort_order`, `is_archived` 0|1). Partial `update` payloads are applied field-wise (LWW).
- Merge picker lists only same-`kind` active categories excluding self; UI enforces source ≠ target.
- **Local gate MUST include `pnpm lint`** (the Deploy workflow runs Lint before `wrangler deploy`; a lint error fails the deploy). Note ESLint `react-hooks/purity`: never call `Date.now()` in a render body/`useMemo` — use `new Date().getTime()` if a timestamp is needed (categories set times via `generateOp`, so this likely won't arise).
- Merging to `main` auto-deploys; verify CI + Deploy green + prod `/settings/categories` and `/app` 200 after.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; `git add` only named files.
- Owner value: this lets Sheik merge his live Bike ×3 / Groceries ×2 dupes directly (post-ship, on-device).
