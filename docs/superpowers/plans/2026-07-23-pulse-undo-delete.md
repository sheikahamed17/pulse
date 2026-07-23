# Undo on Every Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 5-second Undo toast on every delete across all four lists (money/task/learning/note), via a shared undo context; undo emits a forward "resurrection" `update` op.

**Architecture:** A pure `resurrectPayload` helper + an `UndoProvider`/`useUndo` context (owning the existing `useUndoStack` + a single fixed-bottom toast) replaces money's component-local stack. Each list's `deleteX` handler pushes an undo entry whose closure re-emits an `update` op that `op-log.ts applyUpdate` treats as un-delete (resurrection). Task undo is full-fidelity: resurrect the whole cascade set + re-run `rollupOps`.

**Tech Stack:** React 19, TypeScript, Dexie v9, op-log/HLC-LWW sync, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-pulse-undo-delete-design.md`

## Global Constraints

- No new dependency; locked stack. No entity_kind / op-schema / migration / cron / sync-engine change. Dexie v9.
- Undo = a forward `update` op re-asserting one field (relies on the existing `applyUpdate` resurrection rule); NO snapshot storage.
- Both swipe-delete and menu-delete already share `deleteX` — pushing undo inside `deleteX` covers both. Keep it that way.
- Task undo is full fidelity: resurrect the entire tombstoned set (parent + sub-tasks, or a single sub-task) + re-run `rollupOps` on the affected parent.
- Preserve money's existing undo behavior and the toast's positioning/safe-area (`bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50`).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — separate commands; lint 0 errors).

## File Structure

- Create: `src/lib/undo-delete.ts` (pure `resurrectPayload`), `tests/lib/undo-delete.test.ts`, `tests/undo-delete-roundtrip.test.ts`, `docs/superpowers/notes/2026-07-23-pulse-undo-delete-qa-runbook.md`.
- Create: `src/components/undo-provider.tsx` (`UndoProvider` + `useUndo`).
- Modify: `src/app/app/page.tsx` (wrap subtree in `<UndoProvider>`), `src/components/money-list.tsx` (use context, drop local stack + inline toast), `src/components/task-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx`.

---

### Task 1: Pure `resurrectPayload`

**Files:**
- Create: `src/lib/undo-delete.ts`
- Test: `tests/lib/undo-delete.test.ts`

**Interfaces:**
- Produces: `type Resurrectable = 'money' | 'task' | 'learning' | 'note'`; `resurrectPayload(kind: Resurrectable, row: { description?: string | null; title?: string; text?: string; body?: string }): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/undo-delete.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resurrectPayload } from '@/lib/undo-delete'

describe('resurrectPayload', () => {
  it('money re-asserts description (null preserved)', () => {
    expect(resurrectPayload('money', { description: 'chai' })).toEqual({ description: 'chai' })
    expect(resurrectPayload('money', { description: null })).toEqual({ description: null })
    expect(resurrectPayload('money', {})).toEqual({ description: null })
  })
  it('task re-asserts title', () => {
    expect(resurrectPayload('task', { title: 'Call bank' })).toEqual({ title: 'Call bank' })
  })
  it('learning re-asserts text', () => {
    expect(resurrectPayload('learning', { text: 'TIL' })).toEqual({ text: 'TIL' })
  })
  it('note re-asserts body', () => {
    expect(resurrectPayload('note', { body: 'remember' })).toEqual({ body: 'remember' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/undo-delete.test.ts`
Expected: FAIL — cannot resolve `@/lib/undo-delete`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/undo-delete.ts`:

```ts
export type Resurrectable = 'money' | 'task' | 'learning' | 'note'

/**
 * The single-field update payload for an undo op. Re-asserting one field with a
 * newer HLC both restores that value and triggers op-log.ts applyUpdate's
 * resurrection rule (clears deleted_at), bringing a tombstoned row back.
 */
export function resurrectPayload(
  kind: Resurrectable,
  row: { description?: string | null; title?: string; text?: string; body?: string },
): Record<string, unknown> {
  switch (kind) {
    case 'money': return { description: row.description ?? null }
    case 'task': return { title: row.title }
    case 'learning': return { text: row.text }
    case 'note': return { body: row.body }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/undo-delete.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/undo-delete.ts tests/lib/undo-delete.test.ts
git commit -m "feat(undo): pure resurrectPayload helper"
```

---

### Task 2: `UndoProvider` / `useUndo` + mount + refactor money-list

**Files:**
- Create: `src/components/undo-provider.tsx`
- Modify: `src/app/app/page.tsx`, `src/components/money-list.tsx`

**Interfaces:**
- Consumes: `useUndoStack` from `@/hooks/use-undo-stack`; `resurrectPayload` from `@/lib/undo-delete`.
- Produces: `UndoProvider` (React component); `useUndo(): { push: (label: string, undo: () => Promise<void>) => void }`.

- [ ] **Step 1: Create the provider**

Create `src/components/undo-provider.tsx`:

```tsx
'use client'

import { createContext, useContext, useMemo } from 'react'
import { useUndoStack } from '@/hooks/use-undo-stack'

type UndoApi = { push: (label: string, undo: () => Promise<void>) => void }

const UndoContext = createContext<UndoApi | null>(null)

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const { entries, push, trigger, dismiss } = useUndoStack()
  const value = useMemo(() => ({ push }), [push])
  return (
    <UndoContext.Provider value={value}>
      {children}
      <div className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {entries.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-1.5 text-xs shadow">
            <span>{u.label}</span>
            <button type="button" className="font-semibold text-blue-600 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={() => trigger(u.id)}>Undo</button>
            <button type="button" aria-label="Dismiss" className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={() => dismiss(u.id)}>×</button>
          </div>
        ))}
      </div>
    </UndoContext.Provider>
  )
}
```

- [ ] **Step 2: Mount `<UndoProvider>` in the app page**

In `src/app/app/page.tsx`, add the import (near the other component imports):

```ts
import { UndoProvider } from '@/components/undo-provider'
```

Wrap the authenticated return. Change the outer fragment of the main `return (` block (the one starting `<>` with `<AuroraBackground />`, NOT the `if (!user)` early return) so `<UndoProvider>` is the single root:

Replace:
```tsx
  return (
    <>
      <AuroraBackground />
```
with:
```tsx
  return (
    <UndoProvider>
      <AuroraBackground />
```

And replace the matching closing of that return — the final `</>` before the last `)` of the component — with `</UndoProvider>`. (It is the `</>` that pairs with the `<>` opened right after `return (`.)

- [ ] **Step 3: Refactor money-list onto the context**

In `src/components/money-list.tsx`:

Remove the import `import { useUndoStack } from '@/hooks/use-undo-stack'` and add:
```ts
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
```

Replace `const undo = useUndoStack()` with:
```ts
  const undo = useUndo()
```

In `deleteEntry`, change the undo op's payload to use `resurrectPayload`:
```tsx
    undo.push(`Deleted ${formatAmount(e)}`, async () => {
      const undoOp = await generateOp({
        entity_kind: 'money', entity_id: e.id,
        op_type: 'update', payload: resurrectPayload('money', e),
        user_id: userId,
      })
      await applyLocalOp(undoOp)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
```

Remove the inline toast and the now-unneeded fragment. The component currently returns:
```tsx
  return (
    <>
      <ul className="flex flex-col gap-2">
        …entries…
      </ul>

      <div className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {undo.entries.map(u => (
          …
        ))}
      </div>
    </>
  )
```
Change it to return just the `<ul>`:
```tsx
  return (
    <ul className="flex flex-col gap-2">
      …entries… (unchanged)
    </ul>
  )
```
(Delete the `<>`/`</>` wrapper and the entire `<div className="fixed …">…</div>` toast block. `undo.entries`/`undo.trigger`/`undo.dismiss` are no longer referenced here — only `undo.push` remains.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` (expected clean) and `pnpm test tests/lib/undo-delete.test.ts` (still passes). Full gate runs after Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/components/undo-provider.tsx src/app/app/page.tsx src/components/money-list.tsx
git commit -m "feat(undo): shared UndoProvider/useUndo; money-list onto the context"
```

---

### Task 3: task-list full-fidelity undo + integration test

**Files:**
- Modify: `src/components/task-list.tsx`
- Test: `tests/undo-delete-roundtrip.test.ts`

**Interfaces:**
- Consumes: `useUndo` (Task 2), `resurrectPayload` (Task 1), existing `rollupOps` + `db`.

- [ ] **Step 1: Write the integration test (proves the resurrection mechanism)**

Create `tests/undo-delete-roundtrip.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import { resurrectPayload, type Resurrectable } from '@/lib/undo-delete'

const U = 'u1'
async function del(kind: Resurrectable, id: string) {
  await applyLocalOp(await generateOp({ entity_kind: kind, entity_id: id, op_type: 'delete', payload: {}, user_id: U }))
}
async function resurrect(kind: Resurrectable, row: { id: string; description?: string | null; title?: string; text?: string; body?: string }) {
  await applyLocalOp(await generateOp({ entity_kind: kind, entity_id: row.id, op_type: 'update', payload: resurrectPayload(kind, row), user_id: U }))
}

describe('undo delete — resurrection round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('money: delete then undo restores the row', async () => {
    await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: 'm1', op_type: 'create', payload: { amount: 5000, currency: 'INR', direction: 'out', description: 'chai', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual' }, user_id: U }))
    await del('money', 'm1')
    expect((await db.money_entries.get('m1'))?.deleted_at).not.toBeNull()
    await resurrect('money', { id: 'm1', description: 'chai' })
    const m = await db.money_entries.get('m1')
    expect(m?.deleted_at ?? null).toBeNull()
    expect(m?.amount).toBe(5000)
  })

  it('task: full-fidelity undo restores parent + all sub-tasks', async () => {
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: 'p', op_type: 'create', payload: { title: 'Parent', priority: 'medium', completed_at: null, source: 'manual', tags: [], project_id: null }, user_id: U }))
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: 'c1', op_type: 'create', payload: { title: 'C1', priority: 'medium', completed_at: null, source: 'manual', parent_id: 'p', tags: [], project_id: null }, user_id: U }))
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: 'c2', op_type: 'create', payload: { title: 'C2', priority: 'medium', completed_at: null, source: 'manual', parent_id: 'p', tags: [], project_id: null }, user_id: U }))
    // delete parent → cascade: children then parent tombstoned
    await del('task', 'c1'); await del('task', 'c2'); await del('task', 'p')
    expect((await db.tasks.get('p'))?.deleted_at).not.toBeNull()
    // undo: resurrect the whole tombstoned set
    for (const r of [{ id: 'c1', title: 'C1' }, { id: 'c2', title: 'C2' }, { id: 'p', title: 'Parent' }]) await resurrect('task', r)
    expect((await db.tasks.get('p'))?.deleted_at ?? null).toBeNull()
    expect((await db.tasks.get('c1'))?.deleted_at ?? null).toBeNull()
    expect((await db.tasks.get('c2'))?.deleted_at ?? null).toBeNull()
    expect((await db.tasks.get('p'))?.title).toBe('Parent')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/undo-delete-roundtrip.test.ts`
Expected: PASS (2 tests). (Uses only existing code + `resurrectPayload`; it is the regression guard for the mechanism.)

- [ ] **Step 3: Wire undo into `deleteTask`**

In `src/components/task-list.tsx`, add imports:
```ts
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
```

Add the hook next to the other hooks in the component (after `const { prefs } = useUserPrefs()`):
```ts
  const undo = useUndo()
```

Replace the whole `deleteTask` function with:
```tsx
  async function deleteTask(t: TaskRow) {
    // Cascade-delete a parent's sub-tasks (meaningless without the parent).
    const children = tasks.filter(x => x.parent_id === t.id && !x.deleted_at)
    const deletedRows = [...children, t]   // exact rows this action tombstones
    for (const c of children) {
      await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: c.id, op_type: 'delete', payload: {}, user_id: userId }))
    }
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: t.id, op_type: 'delete', payload: {}, user_id: userId }))
    // Deleting a sub-task may leave the remaining siblings all-complete → roll up.
    if (t.parent_id) {
      const all = await db.tasks.where('user_id').equals(userId).toArray()
      const parent = all.find(x => x.id === t.parent_id)
      const remaining = all.filter(x => x.parent_id === t.parent_id && !x.deleted_at) // deleted child already tombstoned
      const roll = parent && !parent.deleted_at ? rollupOps(parent, remaining, new Date().toISOString()) : null
      if (parent && roll) await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: parent.id, op_type: 'update', payload: roll, user_id: userId }))
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push(`Deleted "${t.title}"`, async () => {
      // Resurrect the whole tombstoned set (parent + sub-tasks, or a single sub-task).
      for (const r of deletedRows) {
        await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: r.id, op_type: 'update', payload: resurrectPayload('task', r), user_id: userId }))
      }
      // Re-derive the parent's completion after resurrecting a sub-task.
      if (t.parent_id) {
        const all = await db.tasks.where('user_id').equals(userId).toArray()
        const parent = all.find(x => x.id === t.parent_id)
        const siblings = all.filter(x => x.parent_id === t.parent_id && !x.deleted_at)
        const roll = parent && !parent.deleted_at ? rollupOps(parent, siblings, new Date().toISOString()) : null
        if (parent && roll) await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: parent.id, op_type: 'update', payload: roll, user_id: userId }))
      }
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` (clean) and `pnpm test tests/undo-delete-roundtrip.test.ts` (passes). Full gate after Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/components/task-list.tsx tests/undo-delete-roundtrip.test.ts
git commit -m "feat(undo): full-fidelity undo for task delete (cascade + rollup)"
```

---

### Task 4: learning + notes undo + QA runbook

**Files:**
- Modify: `src/components/learning-list.tsx`, `src/components/notes-list.tsx`
- Create: `docs/superpowers/notes/2026-07-23-pulse-undo-delete-qa-runbook.md`

**Interfaces:**
- Consumes: `useUndo` (Task 2), `resurrectPayload` (Task 1).

- [ ] **Step 1: learning-list undo**

In `src/components/learning-list.tsx`, add imports:
```ts
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
```

Add the hook after `const { prefs } = useUserPrefs()`:
```ts
  const undo = useUndo()
```

Replace `deleteLearning` with:
```tsx
  async function deleteLearning(e: LearningRow) {
    const op = await generateOp({
      entity_kind: 'learning', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push('Deleted learning', async () => {
      const undoOp = await generateOp({
        entity_kind: 'learning', entity_id: e.id,
        op_type: 'update', payload: resurrectPayload('learning', e),
        user_id: userId,
      })
      await applyLocalOp(undoOp)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }
```

- [ ] **Step 2: notes-list undo**

In `src/components/notes-list.tsx`, add imports:
```ts
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
```

Add the hook after `const { prefs } = useUserPrefs()`:
```ts
  const undo = useUndo()
```

Replace `deleteNote` with:
```tsx
  async function deleteNote(e: NoteRow) {
    const op = await generateOp({
      entity_kind: 'note', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push('Deleted note', async () => {
      const undoOp = await generateOp({
        entity_kind: 'note', entity_id: e.id,
        op_type: 'update', payload: resurrectPayload('note', e),
        user_id: userId,
      })
      await applyLocalOp(undoOp)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }
```

- [ ] **Step 3: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-23-pulse-undo-delete-qa-runbook.md`:

```markdown
# Undo on Every Delete — QA Runbook (on-device)

**Per list — Money, Tasks, Learn, Notes (via BOTH swipe-delete and the long-press menu):**
1. Delete a row → a toast "Deleted …" with an "Undo" button appears bottom-center.
2. Tap Undo within 5s → the row reappears in the list.
3. Let the toast sit 5s untouched → it disappears and the delete is permanent.
4. Tap × on the toast → it dismisses immediately (delete stays).

**Task-specific (full fidelity):**
5. Delete a PARENT task that has sub-tasks → Undo → the parent AND all its sub-tasks come back.
6. Delete a single SUB-task (that was the last open one, so the parent auto-completed) → Undo → the sub-task returns and the parent re-opens.

**Regressions:**
7. Money's undo still works exactly as before (delete + Undo restores).
8. Only one toast area (bottom-center), not one per tab; deleting on different tabs stacks entries in the same toast.
9. Reduced motion / safe-area: the toast sits above the home indicator (safe-area inset respected).
```

- [ ] **Step 4: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors (confirm no leftover unused `useUndoStack` import in money-list); tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/learning-list.tsx src/components/notes-list.tsx docs/superpowers/notes/2026-07-23-pulse-undo-delete-qa-runbook.md
git commit -m "feat(undo): undo for learning + notes delete + QA runbook"
```

---

## Post-implementation

- Opus whole-branch review (lenses: resurrection correctness incl. task cascade + rollup re-derivation; regression to money's existing undo; provider mounting/context boundary; toast a11y + safe-area; both swipe + menu trigger undo).
- Merge to `main` (auto-deploys); no D1 migration. Verify CI `success` + prod HTTP 200.
- Owner follow-up: run the QA runbook on-device (esp. task full-fidelity undo, steps 5-6).
