# Task Tags + Projects — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review → implementation plan
**Feature:** Organize tasks two ways — freeform **tags** (reusing the Learning/Notes pattern) and first-class **projects** (a new synced entity). Built together, one deploy.

## Problem

Tasks have no grouping. Learning + Notes already have freeform tags (whole-array LWW + a tag-filter UI); tasks should too. Separately, tasks want a stronger organizing unit — named **projects** (with color, rename, archive) — that a task belongs to and can be filtered by.

## Goal

- Add `tags: string[]` to tasks (manual, editable in the chip; filterable on the Tasks tab) — reusing the Learning/Notes machinery.
- Add a `project` entity (name, color, archived) that tasks reference by `project_id`; create from the chip, manage in Settings, filter on the Tasks tab.

## Global Constraints

- Locked stack. No new dependencies. Reuse the Learning/Notes tag pattern (whole-array LWW, JSON on the server) and mirror the **Budget** entity for the new `project` entity_kind's wiring.
- **New entity_kind `project`** → the full 9 links (op-schema, Dexie store + `db.version(9)` bump, D1 table + migration, Kysely `ProjectTable` + `DB`, `PROJECT_FIELDS`, server `materialize.ts` dispatch, **client `sync-client.ts applyLocalOp` case + transaction table list**, `entity-fields.ts`). The client `applyLocalOp` step is the historically-missed one — a client round-trip test is REQUIRED.
- `tasks.tags` + `tasks.project_id` are **non-indexed** fields on the existing task entity → no tasks-store change (Dexie v9 only adds the `projects` store); filtered in-memory. D1: `ALTER TABLE tasks ADD COLUMN tags TEXT, project_id TEXT`.
- Agent tag-suggestion is OUT of scope (tags/project are set manually in the chip; the parse/agent layer is untouched). Project color IS included (a small preset palette).
- Migrations applied to remote via `wrangler d1 execute pulse --remote --command "<sql>"` (NOT `--file`); one statement per `--command`; apply BEFORE deploying (backward-compatible additions).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Terse, code-first; match surrounding patterns.
- Gate before finishing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (UN-CHAINED).

## Architecture

### A. Tags on tasks
- `TaskPayloadSchema` + `TaskRow` + Kysely `TaskTable` gain `tags: z.array(z.string()).default([])` / `tags: string[]`. `TASK_FIELDS` gains `'tags'`. Materialized exactly like Learning/Notes tags — whole-array LWW, JSON-stringified into the D1 `tasks.tags` TEXT column, native array in Dexie (follow the existing array-field handling in `materialize.ts` / `sync-client.ts` that Learning/Notes use; do NOT invent new serialization).
- Chip: a tag editor in `ConfirmationChipTask` (mirror `ConfirmationChipLearning`'s tag add/remove — input + Enter to add, `×` to remove, dedup + trim). `ChipDraft` task variant carries `tags` (already via `TaskPayload`).
- `confirmEntry` task path writes `tags: final.tags ?? []`.
- Tasks tab: a `TaskTagFilter` (the `LearningTagFilter` pattern — collect distinct tags from the user's tasks in-memory, pill row, single-select). The task list filters to tasks whose `tags` include the selected tag.

### B. Project entity (new entity_kind, mirrors Budget)
- **op-schema** `src/lib/op-schemas/project.ts`: `{ name: z.string().min(1).max(60), color: z.string().nullable().optional(), archived: z.union([z.literal(0), z.literal(1)]) }` (no `.strict()`, matching the others). `type ProjectPayload`.
- **Dexie** `ProjectRow` (`id, user_id, name, color, archived, field_hlcs, deleted_at, created_at, updated_at`) + store at `this.version(9).stores({ projects: 'id, user_id' })` + `projects!: EntityTable<ProjectRow, 'id'>` + `resetDb()` clear.
- **D1** migration `0010_task_tags_projects.sql`: `CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT, archived INTEGER NOT NULL DEFAULT 0, field_hlcs TEXT NOT NULL DEFAULT '{}', deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)` + `CREATE INDEX idx_projects_user ON projects(user_id) WHERE deleted_at IS NULL` + the two `ALTER TABLE tasks` columns.
- **Kysely** `ProjectTable` + `projects: ProjectTable` in `DB`.
- **entity-fields** `PROJECT_FIELDS = ['name', 'color', 'archived']`.
- **Server materialize** (`materialize.ts`): `case 'project' → materializeRow_LWW(db, op, userId, 'projects', PROJECT_FIELDS)`.
- **Client applyLocalOp** (`sync-client.ts`): `case 'project' → { const cur = await db.projects.get(op.entity_id); await db.projects.put(applyOp(cur, op)) }` + add `db.projects` to the `db.transaction([...])` table list. **(the must-not-miss link)**
- `useProjects(userId)` hook (live, non-deleted, non-archived for pickers; a variant incl. archived for the manager).

### C. Task → project reference
- `TaskPayloadSchema` + `TaskRow` + `TaskTable` gain `project_id: z.string().min(1).nullable().optional()` / `project_id: string | null`. `TASK_FIELDS` gains `'project_id'`. Plain string reference (like `money.category_id`); no FK enforced client-side; a dangling `project_id` (project deleted) renders as "no project".
- Chip: a project picker in `ConfirmationChipTask` — select an existing project, "None", or "+ New project" (creates a project op inline via `generateOp('project', …)` then sets `project_id`).
- `confirmEntry` task path writes `project_id`.

### D. UI surfaces
- **Chip** (`ConfirmationChipTask`): tag editor + project picker (above the Repeat toggle).
- **Tasks tab** (`app/page.tsx` tasks view / `task-list.tsx` container): a project filter (dropdown/pills of the user's projects + "All") + the `TaskTagFilter`. Both filters combine (AND): show tasks matching the selected project AND containing the selected tag. Task items show a project chip (name + color dot) + tag chips.
- **Settings → Projects** (`app/settings/…`): list projects (name + color), add, rename, set color (preset swatches), archive/unarchive. Archived projects don't appear in the chip picker but their tasks keep the reference. Delete = tombstone (a delete op); tasks referencing a deleted project show "no project".

### Data Flow

```
create project (chip "+ New" or Settings)
  → generateOp('project','create',{name,color,archived:0}) → applyLocalOp → db.projects → pushPullOnce → server materialize

create task "call bank" + tags:[finance] + project=Money
  → task op {..., tags:['finance'], project_id:<proj-id>} → applyLocalOp → db.tasks

Tasks tab: pick project=Money + tag=finance → in-memory filter tasks where project_id===Money.id && tags.includes('finance')
Settings: rename project → project 'update' op {name} (LWW) → all referencing tasks re-render with the new name (they hold project_id, not the name)
```

### Error Handling

- Tag input: trim, drop empties, dedup (case-sensitive, matching Learning/Notes). No cap enforced beyond sanity.
- Project name: required (1–60); creating a project with a blank name is rejected by the picker.
- Dangling `project_id` (referenced project deleted/archived): task renders "no project"; no crash (the project lookup is a Map `.get` → undefined → fallback).
- A `project` op syncing to a server without the `projects` table would error — the migration is applied to remote BEFORE deploy (backward-compatible).

### Testing

- **Pure** (`tests/lib/task-org.test.ts` or similar): `addTag`/`normalizeTags` (trim/dedup/drop-empty); `filterTasks({ tasks, projectId, tag })` (AND semantics; null filters = pass-through; tag match via includes).
- **Project entity round-trip** (fake-indexeddb): `generateOp('project','create')` → `applyLocalOp` → `db.projects.get` returns the row (the client-materialize link); an `update` (rename) LWW-merges; a `delete` tombstones.
- **Task with tags + project_id round-trip**: create → materializes to Dexie with the array + ref intact.
- **Op-schema**: project schema (name bounds, archived literal); task schema accepts `tags`/`project_id`.
- Chip/Settings/filter UI verified via the QA runbook (no component-render harness in-repo).
- Fixture note: adding required `tags`/`project_id` to `TaskRow` breaks inline task fixtures (db-types/dexie/query-task-exec) — update them (grep, per the recurring-tasks gotcha).

## Out of Scope (v1)

- Agent tag/project suggestion on capture (manual only).
- Sub-tasks / task hierarchy.
- Project-level views beyond filtering (e.g., a dedicated per-project page, progress rollups).
- Reordering / drag-drop; tag rename across tasks; multi-project per task (one project_id).
- Indexing `tasks.tags` / `tasks.project_id` (in-memory filter is sufficient at personal scale).
