# Widgets home dashboard — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Activate the dormant `widgets` entity as a **dedicated `/dashboard`** — a reorderable, cross-domain overview of cards. Seeds a starter set (Spent, Budgets, Today's tasks, a mini spend-trend, Recent activity); the user can add (from a catalog), remove, and reorder (up/down). Persisted via the existing `widgets` op-entity.

**Architecture:** Extend the `widgets` entity with `type` + `sort_order` (migration 0016). Client apply already propagates payload fields via the generic `applyOp` (no client-sync change beyond types); server `materializeWidget` is bespoke and must be extended. A new `/dashboard` route (mirrors `/analytics` + `/insights`) renders cards by type, reusing existing components (MoneyCard, BudgetSection) where possible.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (use `new Date().getTime()` in a memo/handler).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- **Migration 0016** on the `widgets` table (ALTER ADD COLUMN, nullable → backward-compatible; existing widget rows, if any, get NULL type/sort_order — guard reads). Applied to remote D1 is a post-merge OWNER step (`wrangler d1 execute pulse --remote --command`).
- Adding fields to an entity touches server materialize + client apply: `materializeWidget` (extend) + `applyOp` (already generic — verify) + `WidgetRow`/`db.ts` types. Round-trip test both sides.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/dashboard` + `/app` 200. **Whole-branch opus review required** (migration + new surface); it MUST check legacy/empty-data guards (undefined `type`/`sort_order`, zero widgets).

## Background (verified)

- `widgets` table (migration 0001): `{ id, user_id, label, field_hlcs, deleted_at, created_at, updated_at }`. `WidgetRow` in `src/lib/dexie.ts`: `{ id, user_id, label: string | null, field_hlcs, deleted_at, created_at, updated_at }`.
- `src/lib/materialize.ts` `materializeWidget` (bespoke, ~line 122): builds a `row` from the op payload + `onConflict(...).doUpdateSet({ label: row.label, … })`. Currently only `label`.
- `src/lib/sync-client.ts` widget case: `applyOp(current, op)` → `db.widgets.put(next)` — GENERIC merge (propagates any payload field automatically, like money). So `type`/`sort_order` flow client-side for free once in the payload + `WidgetRow`.
- Op creation: `generateOp({ entity_kind:'widget', entity_id, op_type, payload, user_id })` + `applyLocalOp` + `pushPullOnce` — same pattern as categories.
- Reusable cards: `MoneyCard` (`src/components/money-card.tsx`, `userId`), `BudgetSection` (`src/components/budget-section.tsx`, `userId`). Chart primitives: `src/components/charts/bar-trend.tsx` + `computeMoneySeries`/`analyticsPeriods` (`src/lib/analytics.ts`, `src/lib/query-money-exec.ts`). Hooks: `useMoneyEntries`, `useTasks`, `useLearnings`, `useNotes`, `useUserPrefs`, `useFxRates`, `useAllCategories`. Page shell to mirror: `src/app/insights/page.tsx` / `src/app/analytics/page.tsx`.
- Seed pattern to mirror: `src/lib/seed-categories.ts` `seedDefaultCategoriesIfEmpty`.

---

### Task 1: widget data model (type + sort_order)

**Files:**
- Create: `migrations/0016_widget_type_sort.sql`, `src/lib/widgets.ts`, `src/lib/widgets.test.ts`
- Modify: `src/lib/dexie.ts`, `src/lib/db.ts`, `src/lib/materialize.ts`
- Test: extend a widget round-trip in the sync/materialize tests

**Interfaces (Produces):**
- `src/lib/widgets.ts`:
  - `export type WidgetType = 'spent' | 'budgets' | 'today-tasks' | 'spend-trend' | 'recent-activity'`
  - `export const WIDGET_CATALOG: { type: WidgetType; label: string; description: string }[]` (one entry per type, in a canonical order).
  - `export const DEFAULT_WIDGET_TYPES: WidgetType[] = ['spent','budgets','today-tasks','spend-trend','recent-activity']` (the cross-domain starter order).
  - `export function widgetId(userId: string, type: WidgetType): string` → `` `widget-${userId}-${type}` `` (deterministic, so seeding is idempotent + one-of-each by default).
  - a pure `export function reorder(items: {id:string; sort_order:number}[], id: string, dir: 'up'|'down'): {id:string; sort_order:number}[]` returning the items whose sort_order changed (swap with the neighbor), for the UI to emit update ops.
- `WidgetRow` gains `type: string | null` and `sort_order: number` (default 0 when absent).

- [ ] **Step 1: Migration** — `migrations/0016_widget_type_sort.sql`:
```sql
-- Dashboard widgets: which card (`type`) and its position (`sort_order`).
ALTER TABLE widgets ADD COLUMN type TEXT;
ALTER TABLE widgets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
```
- [ ] **Step 2: types** — `dexie.ts` `WidgetRow`: add `type: string | null`, `sort_order: number`. `db.ts` widgets columns: add `type: string | null`, `sort_order: number`.
- [ ] **Step 3: server materialize** — `materialize.ts` `materializeWidget`: read `type` + `sort_order` from the op payload; include them in the inserted `row` AND in the `onConflict(...).doUpdateSet({ label: …, type: …, sort_order: … })`. Default `sort_order` to 0 when the payload omits it; `type` may be null.
- [ ] **Step 4: `src/lib/widgets.ts`** — the catalog/type/id/reorder above. `reorder`: find the item's index in sort_order-ascending order; if moving would go out of bounds, return `[]` (no-op); else swap the two neighbors' `sort_order` values and return those two `{id, sort_order}` records.
- [ ] **Step 5: Tests** — `src/lib/widgets.test.ts`: `widgetId` determinism; `reorder` up/down swaps the right neighbors, boundary no-ops (`[]` at top/bottom). Add a widget round-trip to the sync/materialize test (grep `tests/` for the existing widget materialize test): an op with `payload:{type:'spent', sort_order:2, label:null}` → server row has type+sort_order; client Dexie row (via applyLocalOp) has them too.
- [ ] **Step 6: Gate** `pnpm lint && pnpm typecheck && pnpm test widgets sync` → pass. **Step 7: Commit** named files.

---

### Task 2: seed + `useWidgets` hook + op helpers

**Files:**
- Create: `src/hooks/use-widgets.ts`, `src/lib/seed-widgets.ts`, `src/lib/seed-widgets.test.ts`

**Interfaces (Produces):**
- `useWidgets(userId: string | undefined): WidgetRow[]` — Dexie live query, non-deleted (`!deleted_at`), sorted by `sort_order` asc (tiebreak by `type`). `[]` while loading.
- `seedDefaultWidgetsIfEmpty({ userId }): Promise<{ seeded: number }>` — mirror `seedDefaultCategoriesIfEmpty`: if the user has ZERO non-deleted widgets, create one op per `DEFAULT_WIDGET_TYPES[i]` with `entity_id = widgetId(userId, type)`, `payload:{ type, sort_order: i, label: null }`, via `generateOp`+`applyLocalOp`; guard with a `sync_meta` flag (e.g. `widgets-seeded-v1`) so it runs once; idempotent (deterministic ids). Returns count.

- [ ] **Step 1: `use-widgets.ts`** (mirror `use-archived-categories.ts`/`use-categories.ts` live-query shape).
- [ ] **Step 2: `seed-widgets.ts`** (mirror `seed-categories.ts`: sync_meta guard + deterministic-id creates) + `seed-widgets.test.ts` (fake Dexie: seeds N when empty, no-op when widgets already exist or the flag is set).
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test seed-widgets` → pass. **Step 4: Commit** named files.

---

### Task 3: widget card components + dispatcher

**Files:**
- Create: `src/components/dashboard/widget-card.tsx`, `src/components/dashboard/today-tasks-widget.tsx`, `src/components/dashboard/spend-trend-widget.tsx`, `src/components/dashboard/recent-activity-widget.tsx`, `src/lib/recent-activity.ts`, `src/lib/recent-activity.test.ts`

**Interfaces (Produces):**
- `recent-activity.ts`: `export type ActivityItem = { kind: 'money'|'task'|'learning'|'note'; id: string; label: string; at: string }` and a pure `recentActivity(data: { money: MoneyEntryRow[]; tasks: TaskRow[]; learnings: LearningRow[]; notes: NoteRow[] }, limit: number): ActivityItem[]` — merge all four, each mapped to `{kind,id,label,at}` (at = money.occurred_at / task.created_at / learning.occurred_at / note.occurred_at; label = a short human string), sort by `at` desc, take `limit`. Guard optional/undefined fields.
- `<WidgetCard type: WidgetType, userId: string />` — a dispatcher: `spent`→`<MoneyCard userId>`, `budgets`→`<BudgetSection userId>`, `today-tasks`→`<TodayTasksWidget userId>`, `spend-trend`→`<SpendTrendWidget userId>`, `recent-activity`→`<RecentActivityWidget userId>`; unknown/null type → a muted "Unknown widget" fallback (guards legacy rows). Each card wrapped in a consistent container.
- `<TodayTasksWidget userId />` — due-today + overdue open tasks (from `useTasks(userId,'open')`), a compact list; reuse the row style/`EntryTimestamp` conventions; empty → muted "Nothing due".
- `<SpendTrendWidget userId />` — last ~6 months spend via `analyticsPeriods`+`computeMoneySeries` (direction 'out', toPrimary FX like money-card) → `<BarTrend>`. Compact.
- `<RecentActivityWidget userId />` — `recentActivity(...)` over the four hooks, limit ~6; each item shows a domain glyph + label + `EntryTimestamp`.

- [ ] **Step 1: `recent-activity.ts` + test** (TDD: merge/sort/limit + undefined-guard). **Step 2:** the three new widget components. **Step 3:** the `WidgetCard` dispatcher (with the null/unknown-type fallback). Presentational; rely on typecheck+build.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test recent-activity && pnpm build` → pass. **Step 5: Commit** named files.

---

### Task 4: `/dashboard` page + nav + seed-on-load

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Modify: `src/app/app/page.tsx` (a "Dashboard" header link)

- [ ] **Step 1: page** — mirror `/insights` shell: `authClient.getSession()` → redirect/`setUserId`; `AuroraBackground`; `<main class="mx-auto max-w-md flex flex-col gap-4 p-6">`; header "Dashboard" + back-to-app link. On `userId` set, call `seedDefaultWidgetsIfEmpty({userId})` then `pushPullOnce` (like the app page's seed/dedupe effect). `const widgets = useWidgets(userId)`. Render each widget in `sort_order` order: the `<WidgetCard type userId>` plus a small control row (▲/▼ reorder via `reorder(...)` → emit `widget` update ops for the changed rows + pushPullOnce; ✕ remove → a `widget` delete op). An "Add widget" control: a menu of `WIDGET_CATALOG` types NOT currently present → creates a `widget` op (`entity_id = widgetId(userId,type)`, next `sort_order`). Empty state (all removed) → a muted "Add a widget to get started" + the add menu. 44px controls; `new Date()` only in handlers.
- [ ] **Step 2: nav link** — in `app/page.tsx`, add a 44px "Dashboard" link (near the existing Settings/Search header actions, or next to the Trends link) → `<Link href="/dashboard">`.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (full suite + build; build prerenders /dashboard). **Step 4: Commit** named files.

## Self-review

- **Coverage:** widgets entity activated (type+sort_order, T1) with migration; seed + hook + reorder (T2); the 5 starter cards + dispatcher reusing MoneyCard/BudgetSection (T3); `/dashboard` route with add/remove/reorder + a nav link (T4). ✓
- **Placeholders:** none — data-model + catalog + pure helpers specified; card reuse + page wiring named.
- **Type consistency:** `WidgetType` (T1) consumed by seed/catalog/dispatcher; `WidgetRow.type|sort_order` (T1) read by `useWidgets` (T2) + page (T4); `reorder`/`recentActivity` pure signatures fixed in T1/T3.
- **Legacy/empty guards:** `sort_order` defaults 0, `type` may be null → dispatcher has an unknown-type fallback; `useWidgets` tolerates zero rows; `recentActivity` guards undefined arrays.

## Post-merge (owner)

Apply migration 0016 to the live D1 (`wrangler d1 execute pulse --remote --command "ALTER TABLE widgets ADD COLUMN type TEXT; ALTER TABLE widgets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;"`) — do this BEFORE/around the deploy so the live Worker can materialize the seeded widgets. Then open `/dashboard`: the starter cards seed on first load; add/remove/reorder to taste.
