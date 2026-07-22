# Sub-tasks Implementation — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review → implementation plan
**Feature:** A task can have one level of sub-tasks; the parent shows progress and auto-completes when all sub-tasks are done.

## Problem

Tasks are flat. A multi-step task ("Plan trip" → book flights / book hotel / pack) can't be broken down. Users want a checklist under a task.

## Model (decided)

- **One level** — a sub-task cannot itself have sub-tasks.
- **Bottom-up auto-complete** — completing the last open sub-task auto-completes the parent; re-opening a sub-task re-opens a parent that was auto-completed.
- **Cascade delete** — deleting a parent deletes its sub-tasks.

## Global Constraints

- No new dependencies, no new entity_kind. A sub-task IS a `task` with `parent_id` set.
- `parent_id` is a **non-indexed** field on the task → no Dexie `db.version()` bump; one D1 migration `ALTER TABLE tasks ADD COLUMN parent_id TEXT` (migration `0012`, applied to remote via `wrangler d1 execute pulse --remote --command "…"` before deploy; backward-compatible).
- Reuse the existing task op/materialize path — `parent_id` flows via `TASK_FIELDS` (`case 'task'` unchanged).
- Manual creation (no agent parsing). Leaf-task behavior is unchanged from today.
- Adding a required-ish field: `parent_id` is nullable+optional (default null) — existing tasks have it undefined in Dexie; guard reads with `?? null`. Update inline TaskRow fixtures.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Terse. Gate UN-CHAINED before finishing.

## Architecture

### A. Field
- `TaskPayloadSchema` (`src/lib/op-schemas/task.ts`): `parent_id: z.string().min(1).nullable().optional()`.
- `TaskRow` (`src/lib/dexie.ts`) + Kysely `TaskTable` (`src/lib/db.ts`): `parent_id: string | null`.
- `TASK_FIELDS` (`src/lib/entity-fields.ts`): `+ 'parent_id'`.
- Migration `0012_task_parent_id.sql`.

### B. Pure helpers (`src/lib/subtasks.ts`)
- `type TaskNode = TaskRow & { children: TaskRow[] }`.
- `groupTasks(tasks: TaskRow[]): TaskNode[]` — returns top-level tasks (`parent_id == null`) each with a `children` array (tasks whose `parent_id` === the top-level id), preserving the input's sort order within each level. A task whose `parent_id` points to a missing/deleted parent (orphan) is treated as top-level (defensive).
- `subtaskProgress(node: TaskNode): { done: number; total: number } | null` — `null` when no children; else counts completed children / total.
- `rollupOps(parent: TaskRow, children: TaskRow[], nowIso: string): { completed_at: string | null } | null` — the parent completion the child-set now implies: if `children.length > 0` and ALL children complete and `parent.completed_at == null` → `{ completed_at: nowIso }`; if some child open and `parent.completed_at != null` → `{ completed_at: null }`; else `null` (no change). PURE; the child-set passed in already reflects the just-applied toggle.

### C. task-list.tsx — render + wiring
- `const nodes = useMemo(() => groupTasks(shown), [shown])` after the existing `filterTasks` (Task tags/projects). Render each node's parent row, then its `children` indented (a nested `<ul>` / padded `<li>`s), completed children struck-through. Parent row shows a "done/total" badge from `subtaskProgress`.
- **Parent checkbox is derived** (reflects all-children-complete); tapping it is a no-op / disabled when it has children (completion is driven by the children). Leaf tasks toggle exactly as today.
- `toggleComplete(child)` for a sub-task: after applying the child's completion `update` op, recompute the sibling set (children with the toggle applied) and call `rollupOps(parent, siblings, now)`; if it returns a change, emit a parent `update` op with that `completed_at`. (For a recurring leaf, the existing recurring spawn still applies — a sub-task is never recurring in v1.)
- **Inline "+ sub-task":** under each top-level task (not under a sub-task), a small title input; on submit, create a task op `{ title, priority: 'medium', completed_at: null, source: 'manual', parent_id: <parent.id>, tags: [], project_id: null }`.
- **Delete a parent:** emit a delete op for each child (from `groupTasks` children) then the parent. Deleting a sub-task: just deletes that one (then `rollupOps` may re-open the parent if it was complete — handle in the same delete path: after deleting a child, recompute rollup).

### Data Flow

```
"Plan trip" (parent) + "+ sub-task: book flights / book hotel / pack"
  → 3 task ops with parent_id = plan-trip.id
  → groupTasks → { Plan trip, children:[flights, hotel, pack] }, badge 0/3

complete flights, hotel, pack (the last one):
  → child update {completed_at} ; siblings now all complete
  → rollupOps → { completed_at: now } → parent update op → parent shows done (moves to Completed)

re-open "pack": child update {completed_at:null} → rollupOps → { completed_at:null } → parent re-opens

delete "Plan trip": delete ops for flights/hotel/pack + Plan trip
```

### Error Handling

- Orphan sub-task (parent deleted out from under it, or a race): `groupTasks` renders it at top level (no crash).
- `parent_id` undefined on legacy tasks → treated as null (top-level), guarded with `?? null`.
- A sub-task never gets a "+ sub-task" affordance (one-level invariant enforced in the render).

### Testing

- **Pure** (`tests/lib/subtasks.test.ts`): `groupTasks` (nesting; order; orphan → top-level; empty); `subtaskProgress` (null when leaf; done/total); `rollupOps` (last child complete → `{completed_at:now}`; a child open + parent complete → `{completed_at:null}`; partial/no-children → null).
- **Round-trip** (fake-indexeddb): create a parent + 3 children via ops; completing all 3 (applying `rollupOps` each time) → the parent's stored `completed_at` is set; re-opening one → parent clears; deleting the parent → children tombstoned.
- Fixture note: adding `parent_id` to `TaskRow` breaks inline task fixtures (db-types/dexie/query-task-exec/task-org) → add `parent_id: null` (the recurring/tags gotcha, third time).

## Out of Scope (v1)

- Arbitrary nesting depth.
- Sub-tasks with their own due/priority/tags/project (they inherit context visually; the inline add is title-only).
- Recurring + sub-tasks combined.
- Top-down completion (completing a parent completing all children) — bottom-up only.
- Drag to re-parent / reorder.
