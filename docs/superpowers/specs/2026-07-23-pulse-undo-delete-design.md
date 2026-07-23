# Undo on Every Delete — Design

**Date:** 2026-07-23
**Status:** Approved (design)
**Feature:** A 5-second Undo toast on every delete across all four lists (money / task / learning / note), unifying the pattern that today exists only for money.

## Goal

Deleting a task, learning, or note is currently immediate and irreversible (only money has an Undo toast). Since delete is now a one-gesture action (swipe-to-reveal) and a menu item, an accidental delete needs a safety net. Give all four lists the same 5s Undo toast, backed by a single shared undo stack.

## Non-goals

- No new entity_kind / op-schema / migration / cron / sync-engine change. Dexie stays v9.
- No change to the delete ops themselves; undo is a *forward* op (see below), not a snapshot restore.
- Budget deletes are out of scope (budgets are managed in their own section, not the four entity lists).

## Mechanism — undo is a forward "resurrection" op

In the op-log/HLC-LWW engine you cannot un-happen a delete; you emit a newer op. `op-log.ts applyUpdate` has an explicit resurrection rule: an `update` op whose HLC is later than the row's `deleted_at` clears the tombstone (`deleted_at = null`). So **undo = emit an `update` op that re-asserts one field** — the row comes back and the op syncs to other devices like any other. Money's existing undo already relies on this (its undo emits `update {description}`). We name and generalize it.

## Architecture

**Shared undo context** replaces money's component-local stack, so all four lists push to one stack and a single toast renders once.

### Unit 1 — `src/lib/undo-delete.ts` (pure, tested)

```ts
export type Resurrectable = 'money' | 'task' | 'learning' | 'note'
// The single-field update payload that restores a value AND triggers resurrection.
export function resurrectPayload(
  kind: Resurrectable,
  row: { description?: string | null; title?: string; text?: string; body?: string },
): Record<string, unknown>
```
(No `EntityKind` import — the kind is a local literal union passed by the caller.)
Returns: money → `{ description: row.description ?? null }`; task → `{ title: row.title }`; learning → `{ text: row.text }`; note → `{ body: row.body }`. Pure; unit-tested per kind.

### Unit 2 — `src/components/undo-provider.tsx`

`UndoProvider` wraps `useUndoStack()` (the existing hook, unchanged), renders `children` plus one fixed-bottom `<UndoToast>` (markup lifted verbatim from money-list — keeps `bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50` and the per-entry Undo/× buttons). Exposes `useUndo(): { push: (label: string, undo: () => Promise<void>) => void }` via context. Throwing if used outside the provider is fine (developer error).

### Unit 3 — mount + refactor

- App page (`src/app/app/page.tsx`): wrap the returned subtree in `<UndoProvider>` so the four lists are descendants and the toast renders once.
- `money-list.tsx`: drop the local `useUndoStack()` and its inline toast `<div>`; call `useUndo().push(...)` in `deleteEntry` (payload via `resurrectPayload('money', e)`). Net behavior unchanged.
- `learning-list.tsx` / `notes-list.tsx`: in `deleteLearning` / `deleteNote`, after the delete op, `push` an undo that emits an `update` op with `resurrectPayload('learning'|'note', row)`.
- `task-list.tsx`: `deleteTask` already computes the cascade set. Capture the tombstoned ids (`[t, ...children]` for a parent, or `[t]` for a leaf/sub-task). Undo resurrects each via an `update` op (`resurrectPayload('task', row)`) and, if the deleted row had a `parent_id`, re-reads siblings fresh from `db.tasks` and re-runs `rollupOps` on the parent so completion state is consistent (the same fresh-read pattern used in the sub-task feature).

## Data flow

`deleteX(row)` → emit delete op(s) → `applyLocalOp` → `pushPullOnce` → `useUndo().push(label, closure)`. Tapping **Undo** within 5s runs `closure`: emit resurrection `update` op(s) → `applyLocalOp` (clears `deleted_at`) → `pushPullOnce`; `useLiveQuery` re-renders the row(s). The toast auto-expires at 5s (existing `useUndoStack` TTL).

## Error handling

- Undo closures reuse `generateOp`/`applyLocalOp`/`pushPullOnce`; sync failures are caught + logged (existing pattern).
- If the row changed on another device between delete and undo, LWW reconciles on the resurrection op's HLC.
- Undo after the toast expires is impossible (entry removed); no stale-closure risk (closure captures the row snapshot at delete time, which is what we want to restore).

## Testing

**Unit (`tests/lib/undo-delete.test.ts`)** — `resurrectPayload` for all four kinds (incl. money null description). ~4 cases.

**Integration (`tests/undo-delete-roundtrip.test.ts`, fake-indexeddb, mirroring `tests/task-tags-project.test.ts`):**
- money: create → delete → apply `resurrectPayload` update → row `deleted_at` null (visible again).
- task full fidelity: create parent + 2 children → delete parent (cascade all 3 → 4 rows tombstoned via delete ops) → apply resurrection updates for all 4 → all `deleted_at` null; then a sub-task-delete case → resurrect + `rollupOps` re-derives the parent.

The provider/toast/press-Undo wiring is QA-runbook-verified on device (`docs/superpowers/notes/2026-07-23-pulse-undo-delete-qa-runbook.md`).

## Plan shape

~4 tasks: (1) `resurrectPayload` + tests; (2) `UndoProvider`/`useUndo` + mount + refactor money-list; (3) task-list full-fidelity undo + integration test; (4) learning + notes undo + QA runbook. Opus whole-branch review (lenses: resurrection correctness incl. task cascade + rollup; regression to money's existing undo; provider mounting/context; toast a11y + safe-area).

## Constraints (verbatim)

- No new dependency; locked stack. No entity/op-schema/migration/cron/sync-engine change. Dexie v9.
- Undo = a forward `update` op re-asserting one field (relies on `applyUpdate` resurrection); no snapshot storage.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck` / `lint` / `test` / `build`).
- Both swipe-delete and menu-delete must trigger undo (they share `deleteX` — keep it that way).
- Task undo is full fidelity: resurrect the whole tombstoned set + re-run `rollupOps`.
- Preserve money's existing undo behavior and the toast's safe-area/positioning.
