# Edit Captured Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit an existing money / task / learning / note entry in place by reusing `ConfirmationChip` in an edit mode that emits an op-log `update` op.

**Architecture:** Four pure `Row → ChipDraft` mappers + a `mode` prop on `ConfirmationChip` (hide recurring, "Save changes") + an `editId` state and `updateEntry` on the app page (emits an `update` op with the editable field subset) + an "Edit" item in each list's existing long-press menu. Reuses the whole capture pipeline; only op_type + payload subset differ.

**Tech Stack:** React 19, TypeScript, Dexie v9, op-log/HLC-LWW sync, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-22-pulse-edit-entries-design.md`

## Global Constraints

- No new dependency (`Pencil` already ships in `lucide-react`). Locked stack only.
- No entity_kind / op-schema / migration / cron / sync-engine change. Dexie stays v9.
- `update` ops with partial payloads are the established LWW mechanism — do not touch `materialize.ts` or `sync-client.ts` applyLocalOp.
- `ConfirmationChip` stays presentational: it never learns which row it edits or that persistence is an update. The page owns create-vs-update via `editId`.
- Editable subset per kind (the update op sends EXACTLY these, nothing else): money `{amount, currency, direction, category_id, description}`; task `{title, due_at, priority, tags, project_id}`; learning `{text, tags, attribution}`; note `{body, title, tags}`.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` as four separate commands; lint 0 errors).
- No date/`occurred_at` editing (chip never exposed it) — out of scope.

## File Structure

- Create: `src/lib/entry-to-draft.ts` — four pure `Row → Extract<ChipDraft,{kind}>` mappers.
- Create: `tests/lib/entry-to-draft.test.ts`, `tests/edit-update-roundtrip.test.ts`, `docs/superpowers/notes/2026-07-22-pulse-edit-entries-qa-runbook.md`.
- Modify: `src/components/confirmation-chip.tsx` (add `mode` prop, thread to sub-chips).
- Modify: `src/app/app/page.tsx` (`editId` state, `updateEntry`, four `editX` handlers, chip `mode` + cancel clears editId, pass `onEdit` to lists).
- Modify: `src/components/{money,task,learning,notes}-list.tsx` (`onEdit?` prop + "Edit" menu item).

---

### Task 1: Pure `entry-to-draft.ts` mappers

**Files:**
- Create: `src/lib/entry-to-draft.ts`
- Test: `tests/lib/entry-to-draft.test.ts`

**Interfaces:**
- Consumes: `ChipDraft` from `@/components/confirmation-chip`; row types `MoneyEntryRow`, `TaskRow`, `LearningRow`, `NoteRow` from `@/lib/dexie`; `Currency` from `@/lib/op-schemas/money`.
- Produces:
  - `moneyRowToDraft(r: MoneyEntryRow): Extract<ChipDraft, { kind: 'money' }>`
  - `taskRowToDraft(r: TaskRow): Extract<ChipDraft, { kind: 'task' }>`
  - `learningRowToDraft(r: LearningRow): Extract<ChipDraft, { kind: 'learning' }>`
  - `noteRowToDraft(r: NoteRow): Extract<ChipDraft, { kind: 'note' }>`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/entry-to-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { moneyRowToDraft, taskRowToDraft, learningRowToDraft, noteRowToDraft } from '@/lib/entry-to-draft'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'

const base = { user_id: 'u1', field_hlcs: {}, deleted_at: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }

describe('entry-to-draft mappers', () => {
  it('money: maps all domain fields + kind', () => {
    const r: MoneyEntryRow = { ...base, id: 'm1', amount: 7500, currency: 'INR', direction: 'out', category_id: 'c1', description: 'rent', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null }
    expect(moneyRowToDraft(r)).toEqual({
      kind: 'money', amount: 7500, currency: 'INR', direction: 'out', category_id: 'c1',
      description: 'rent', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual',
      receipt_key: null, raw_input: null, recurring_rule_id: null,
    })
  })

  it('money: null category/description survive', () => {
    const r: MoneyEntryRow = { ...base, id: 'm2', amount: 100, currency: 'USD', direction: 'in', category_id: null, description: null, occurred_at: '2026-07-01T10:00:00.000Z', source: 'voice', receipt_key: null, raw_input: 'got 1', recurring_rule_id: null }
    const d = moneyRowToDraft(r)
    expect(d.category_id).toBeNull()
    expect(d.description).toBeNull()
    expect(d.direction).toBe('in')
  })

  it('task: maps fields, defaults undefined tags to []', () => {
    const r = { ...base, id: 't1', title: 'Call bank', due_at: '2026-07-02T09:00:00.000Z', priority: 'high', completed_at: null, source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: undefined as unknown as string[], project_id: 'p1', parent_id: null } as TaskRow
    const d = taskRowToDraft(r)
    expect(d).toMatchObject({ kind: 'task', title: 'Call bank', due_at: '2026-07-02T09:00:00.000Z', priority: 'high', project_id: 'p1' })
    expect(d.tags).toEqual([])
  })

  it('task: null due/project survive', () => {
    const r: TaskRow = { ...base, id: 't2', title: 'x', due_at: null, priority: 'medium', completed_at: null, source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: ['a'], project_id: null, parent_id: null }
    const d = taskRowToDraft(r)
    expect(d.due_at).toBeNull()
    expect(d.project_id).toBeNull()
    expect(d.tags).toEqual(['a'])
  })

  it('learning: maps text/tags/attribution', () => {
    const r: LearningRow = { ...base, id: 'l1', text: 'TIL', tags: ['ai'], attribution: 'blog', source: 'manual', occurred_at: '2026-07-01T10:00:00.000Z' }
    expect(learningRowToDraft(r)).toEqual({ kind: 'learning', text: 'TIL', tags: ['ai'], attribution: 'blog', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual' })
  })

  it('note: maps body/title/tags, null title survives', () => {
    const r: NoteRow = { ...base, id: 'n1', title: null, body: 'remember this', tags: [], source: 'voice', occurred_at: '2026-07-01T10:00:00.000Z' }
    const d = noteRowToDraft(r)
    expect(d).toEqual({ kind: 'note', title: null, body: 'remember this', tags: [], occurred_at: '2026-07-01T10:00:00.000Z', source: 'voice' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/entry-to-draft.test.ts`
Expected: FAIL — cannot resolve `@/lib/entry-to-draft`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/entry-to-draft.ts`:

```ts
import type { ChipDraft } from '@/components/confirmation-chip'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'
import type { Currency } from '@/lib/op-schemas/money'

export function moneyRowToDraft(r: MoneyEntryRow): Extract<ChipDraft, { kind: 'money' }> {
  return {
    kind: 'money',
    amount: r.amount,
    currency: r.currency as Currency,
    direction: r.direction,
    category_id: r.category_id,
    description: r.description,
    occurred_at: r.occurred_at,
    source: r.source,
    receipt_key: r.receipt_key,
    raw_input: r.raw_input,
    recurring_rule_id: r.recurring_rule_id,
  }
}

export function taskRowToDraft(r: TaskRow): Extract<ChipDraft, { kind: 'task' }> {
  return {
    kind: 'task',
    title: r.title,
    due_at: r.due_at,
    priority: r.priority,
    completed_at: r.completed_at,
    source: r.source,
    raw_input: r.raw_input,
    recur_period: r.recur_period,
    recur_interval: r.recur_interval,
    tags: r.tags ?? [],
    project_id: r.project_id,
    parent_id: r.parent_id,
  }
}

export function learningRowToDraft(r: LearningRow): Extract<ChipDraft, { kind: 'learning' }> {
  return {
    kind: 'learning',
    text: r.text,
    tags: r.tags ?? [],
    attribution: r.attribution,
    occurred_at: r.occurred_at,
    source: r.source,
  }
}

export function noteRowToDraft(r: NoteRow): Extract<ChipDraft, { kind: 'note' }> {
  return {
    kind: 'note',
    title: r.title,
    body: r.body,
    tags: r.tags ?? [],
    occurred_at: r.occurred_at,
    source: r.source,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/entry-to-draft.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/entry-to-draft.ts tests/lib/entry-to-draft.test.ts
git commit -m "feat(edit): pure Row->ChipDraft mappers for edit"
```

---

### Task 2: `ConfirmationChip` `mode` prop

**Files:**
- Modify: `src/components/confirmation-chip.tsx`

**Interfaces:**
- Produces: `ConfirmationChip` gains optional prop `mode?: 'create' | 'edit'` (default `'create'`), forwarded to every sub-chip. In `'edit'`: money + task hide their recurring block; all four relabel the confirm button "Save changes".

- [ ] **Step 1: Add `mode` to Props and thread it to sub-chips**

In `src/components/confirmation-chip.tsx`, extend `Props`:

```ts
type Props = {
  userId: string
  draft: ChipDraft
  categoryById: Map<string, CategoryRow>
  onConfirm: (final: ChipDraft, recurring: { enabled: boolean; period: Period; intervalCount: number }) => Promise<void>
  onCancel: () => void
  mode?: 'create' | 'edit'
}
```

Update the `ConfirmationChip` dispatcher to accept and forward `mode` (default `'create'`):

```tsx
export function ConfirmationChip({ userId, draft, categoryById, onConfirm, onCancel, mode = 'create' }: Props) {
  if (draft.kind === 'task') {
    return <ConfirmationChipTask userId={userId} draft={draft} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
  }
  if (draft.kind === 'learning') {
    return <ConfirmationChipLearning draft={draft} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
  }
  if (draft.kind === 'note') {
    return <ConfirmationChipNote draft={draft} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
  }
  if (draft.kind === 'budget') {
    return <ConfirmationChipBudget draft={draft} onConfirm={onConfirm} onCancel={onCancel} />
  }
  return <ConfirmationChipMoney userId={userId} draft={draft} categoryById={categoryById} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
}
```

- [ ] **Step 2: Money sub-chip — accept `mode`, hide recurring, relabel**

In `ConfirmationChipMoney`, add `mode` to its param destructuring and type (`mode: 'create' | 'edit'`), then `const isEdit = mode === 'edit'`. Wrap the recurring block so it only renders when NOT editing, and change the confirm button label. Concretely:

Change the signature line to include `mode`:
```tsx
function ConfirmationChipMoney({
  userId,
  draft,
  categoryById,
  onConfirm,
  onCancel,
  mode,
}: {
  userId: string
  draft: MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string }
  categoryById: Map<string, CategoryRow>
  onConfirm: Props['onConfirm']
  onCancel: () => void
  mode: 'create' | 'edit'
}) {
```

Add `const isEdit = mode === 'edit'` next to the other consts (after `const cat = …`).

Wrap the recurring block (`<div className="mb-3 flex flex-col gap-2"> … PeriodPicker … </div>`) in `{!isEdit && ( … )}`.

Change the confirm button label:
```tsx
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy}>
          {isEdit ? 'Save changes' : `Confirm ${symbol}${major}`}
        </Button>
```

- [ ] **Step 3: Task sub-chip — accept `mode`, hide recurring, relabel**

In `ConfirmationChipTask`, add `mode` to the destructuring + type (`mode: 'create' | 'edit'`), add `const isEdit = mode === 'edit'` after the `useUserPrefs` line, wrap the "Repeat after completion" block (`<div className="mb-3 flex flex-col gap-2"> … </div>`) in `{!isEdit && ( … )}`, and change the button label:
```tsx
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.title.trim()}>
          {isEdit ? 'Save changes' : 'Confirm task'}
        </Button>
```

- [ ] **Step 4: Learning + Note sub-chips — accept `mode`, relabel**

In `ConfirmationChipLearning`, add `mode: 'create' | 'edit'` to the destructuring + type, `const isEdit = mode === 'edit'` after the `busy` state, and:
```tsx
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.text.trim()}>
          {isEdit ? 'Save changes' : 'Confirm learning'}
        </Button>
```

In `ConfirmationChipNote`, add `mode: 'create' | 'edit'` to the destructuring + type, `const isEdit = mode === 'edit'` after the `busy` state, and:
```tsx
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.body.trim()}>
          {isEdit ? 'Save changes' : 'Confirm note'}
        </Button>
```

(`ConfirmationChipBudget` is unchanged — budget is not edited via the chip.)

- [ ] **Step 5: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/confirmation-chip.tsx
git commit -m "feat(edit): ConfirmationChip mode prop (hide recurring, Save changes)"
```

---

### Task 3: `editId` + `updateEntry` + edit handlers on the app page

**Files:**
- Modify: `src/app/app/page.tsx`
- Test: `tests/edit-update-roundtrip.test.ts`

**Interfaces:**
- Consumes: `moneyRowToDraft`, `taskRowToDraft`, `learningRowToDraft`, `noteRowToDraft` from `@/lib/entry-to-draft`; row types from `@/lib/dexie`; `ConfirmationChip` `mode` prop (Task 2).
- Produces: page-local `editId` state; `updateEntry(final: ChipDraft, id: string)`; `editMoney/editTask/editLearning/editNote(row)` handlers passed to the lists as `onEdit` in Task 4.

- [ ] **Step 1: Write the failing test (update round-trip)**

Create `tests/edit-update-roundtrip.test.ts` (mirrors `tests/task-tags-project.test.ts`):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('edit via update op — round-trip', () => {
  beforeEach(async () => { await resetDb() })

  it('money: update changes edited fields, preserves untouched', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'money', entity_id: 'm1', op_type: 'create',
      payload: { amount: 8000, currency: 'INR', direction: 'out', category_id: 'c1', description: 'chai', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual' },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'money', entity_id: 'm1', op_type: 'update',
      payload: { amount: 7500, currency: 'INR', direction: 'out', category_id: 'c2', description: 'July rent' },
      user_id: U,
    }))
    const m = await db.money_entries.get('m1')
    expect(m?.amount).toBe(7500)
    expect(m?.category_id).toBe('c2')
    expect(m?.description).toBe('July rent')
    expect(m?.occurred_at).toBe('2026-07-01T10:00:00.000Z') // untouched
    expect(m?.source).toBe('manual')                         // untouched
  })

  it('task: update changes title/priority/tags/project, preserves completed_at + source', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'create',
      payload: { title: 'old', priority: 'low', completed_at: null, source: 'manual', tags: ['a'], project_id: null },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: 't1', op_type: 'update',
      payload: { title: 'new', due_at: null, priority: 'high', tags: ['a', 'b'], project_id: 'p1' },
      user_id: U,
    }))
    const t = await db.tasks.get('t1')
    expect(t?.title).toBe('new')
    expect(t?.priority).toBe('high')
    expect(t?.tags).toEqual(['a', 'b'])
    expect(t?.project_id).toBe('p1')
    expect(t?.completed_at ?? null).toBeNull()   // untouched
    expect(t?.source).toBe('manual')             // untouched
  })
})
```

- [ ] **Step 2: Run test to verify it passes (proves the sync mechanism)**

Run: `pnpm test tests/edit-update-roundtrip.test.ts`
Expected: PASS (2 tests). This validates that `update` ops with a partial payload materialize via LWW — the mechanism `updateEntry` relies on. (These use only existing code, so they pass immediately; they are the regression guard for the feature.)

- [ ] **Step 3: Add imports + `editId` state**

In `src/app/app/page.tsx`, add to the imports (near the other component/lib imports):

```ts
import { moneyRowToDraft, taskRowToDraft, learningRowToDraft, noteRowToDraft } from '@/lib/entry-to-draft'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'
```

(If `@/lib/dexie` is already imported for `db`, add the row types to that existing import instead of a second line.)

Next to `const [draft, setDraft] = useState<ChipDraft | null>(null)` (line ~254), add:

```ts
  const [editId, setEditId] = useState<string | null>(null)
```

- [ ] **Step 4: Add the edit handlers + `updateEntry`**

Immediately BEFORE `async function confirmEntry(` (line ~435), add:

```tsx
  function editMoney(r: MoneyEntryRow) { if (draft) return; setEditId(r.id); setDraft(moneyRowToDraft(r)) }
  function editTask(r: TaskRow) { if (draft) return; setEditId(r.id); setDraft(taskRowToDraft(r)) }
  function editLearning(r: LearningRow) { if (draft) return; setEditId(r.id); setDraft(learningRowToDraft(r)) }
  function editNote(r: NoteRow) { if (draft) return; setEditId(r.id); setDraft(noteRowToDraft(r)) }

  async function updateEntry(final: ChipDraft, id: string) {
    if (!user) return
    let entity_kind: 'money' | 'task' | 'learning' | 'note'
    let payload: Record<string, unknown>
    switch (final.kind) {
      case 'money':
        entity_kind = 'money'
        payload = { amount: final.amount, currency: final.currency, direction: final.direction, category_id: final.category_id ?? null, description: final.description ?? null }
        break
      case 'task':
        entity_kind = 'task'
        payload = { title: final.title, due_at: final.due_at ?? null, priority: final.priority, tags: final.tags ?? [], project_id: final.project_id ?? null }
        break
      case 'learning':
        entity_kind = 'learning'
        payload = { text: final.text, tags: final.tags, attribution: final.attribution ?? null }
        break
      case 'note':
        entity_kind = 'note'
        payload = { body: final.body, title: final.title ?? null, tags: final.tags }
        break
      default:
        setDraft(null); setEditId(null)
        return // budget is not edited via the chip
    }
    const op = await generateOp({ entity_kind, entity_id: id, op_type: 'update', payload, user_id: user.id })
    await applyLocalOp(op)
    setDraft(null); setEditId(null)
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }
```

- [ ] **Step 5: Branch `confirmEntry` to update when editing**

At the very top of `confirmEntry`, right after `if (!user) return`, add:

```tsx
    if (editId) { await updateEntry(final, editId); return }
```

- [ ] **Step 6: Pass `mode` to the chip + clear `editId` on cancel**

Update the `<ConfirmationChip .../>` render block (line ~643) to pass `mode` and clear `editId` on cancel:

```tsx
          {draft && (
            <ConfirmationChip
              userId={user.id}
              draft={draft}
              categoryById={categoryById}
              onConfirm={confirmEntry}
              mode={editId ? 'edit' : 'create'}
              onCancel={() => {
                if (draft?.kind === 'money' && draft.draftId) deleteReceiptDraft(draft.draftId).catch(console.error)
                setDraft(null)
                setEditId(null)
              }}
            />
          )}
```

- [ ] **Step 7: Partial verify (the round-trip tests only)**

Run: `pnpm test tests/edit-update-roundtrip.test.ts`
Expected: PASS (2 tests).

**Do NOT run `pnpm typecheck`/`lint`/`build` yet.** The four `editMoney`/`editTask`/`editLearning`/`editNote` handlers are defined here but not *used* until Task 4 wires them into the list renders. With `noUnusedLocals` (typecheck) and `no-unused-vars` (lint) both on, a standalone gate here would fail on those four. The full UN-CHAINED gate runs once at the end of Task 4, after the handlers are consumed. Task 3 and Task 4 are executed back-to-back for this reason.

- [ ] **Step 8: Commit**

```bash
git add src/app/app/page.tsx tests/edit-update-roundtrip.test.ts
git commit -m "feat(edit): editId + updateEntry + edit handlers on app page"
```

---

### Task 4: `onEdit` prop + "Edit" menu item in all four lists + QA runbook

**Files:**
- Modify: `src/components/money-list.tsx`, `src/components/task-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx`
- Modify: `src/app/app/page.tsx` (pass `onEdit` to each list)
- Create: `docs/superpowers/notes/2026-07-22-pulse-edit-entries-qa-runbook.md`

**Interfaces:**
- Consumes: the `editMoney/editTask/editLearning/editNote` handlers (Task 3).

- [ ] **Step 1: money-list — `onEdit` prop + menu item**

In `src/components/money-list.tsx`:

Add `Pencil` to the lucide import:
```ts
import { Trash2, Pencil } from 'lucide-react'
```

Change the Props type + component signature:
```ts
type Props = { userId: string; onEdit?: (row: MoneyEntryRow) => void }
```
```tsx
export function MoneyList({ userId, onEdit }: Props) {
```

In the long-press menu (the `{menuFor === e.id && ( … )}` block), add the Edit button as the FIRST child, before the Delete button:
```tsx
                  {onEdit && (
                    <button
                      type="button"
                      aria-label={`Edit entry: ${e.description || formatAmount(e)}`}
                      className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      onClick={() => { onEdit(e); setMenuFor(null) }}
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  )}
```

- [ ] **Step 2: task-list — `onEdit` prop + menu item**

In `src/components/task-list.tsx`:

Add `Pencil` to the lucide import (append to the existing `{ Circle, CheckCircle2, Trash2, Repeat, Plus }`):
```ts
import { Circle, CheckCircle2, Trash2, Repeat, Plus, Pencil } from 'lucide-react'
```

Extend Props + signature:
```ts
type Props = { userId: string; filter: TaskFilter; projectId?: string | null; tag?: string | null; onEdit?: (row: TaskRow) => void }
```
```tsx
export function TaskList({ userId, filter, projectId = null, tag = null, onEdit }: Props) {
```

In `renderRow`'s menu block (`{menuFor === t.id && ( … )}`), add as the first child before Delete:
```tsx
            {onEdit && (
              <button
                type="button"
                aria-label={`Edit task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => { onEdit(t); setMenuFor(null) }}
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            )}
```

- [ ] **Step 3: learning-list — `onEdit` prop + menu item**

In `src/components/learning-list.tsx`:

Add `Pencil`:
```ts
import { Trash2, Pencil } from 'lucide-react'
```

Extend Props + signature:
```ts
type Props = { userId: string; selectedTag: string | null; onEdit?: (row: LearningRow) => void }
```
```tsx
export function LearningList({ userId, selectedTag, onEdit }: Props) {
```

In the menu block (`{menuFor === e.id && ( … )}`), first child before Delete:
```tsx
              {onEdit && (
                <button
                  type="button"
                  aria-label={`Edit learning: ${e.text.slice(0, 30)}${e.text.length > 30 ? '…' : ''}`}
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                  onClick={() => { onEdit(e); setMenuFor(null) }}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
```

- [ ] **Step 4: notes-list — `onEdit` prop + menu item**

In `src/components/notes-list.tsx`:

Add `Pencil`:
```ts
import { Trash2, Pencil } from 'lucide-react'
```

Extend Props + signature:
```ts
type Props = { userId: string; selectedTag: string | null; searchQuery?: string; onEdit?: (row: NoteRow) => void }
```
```tsx
export function NotesList({ userId, selectedTag, searchQuery = '', onEdit }: Props) {
```

In the menu block (`{menuFor === e.id && ( … )}`), first child before Delete:
```tsx
              {onEdit && (
                <button
                  type="button"
                  aria-label={`Edit note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                  onClick={() => { onEdit(e); setMenuFor(null) }}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
```

- [ ] **Step 5: Wire the handlers on the page**

In `src/app/app/page.tsx`, pass `onEdit` to each list render:

- Line ~734: `<MoneyList userId={user.id} onEdit={editMoney} />`
- Line ~742: `<TaskList userId={user.id} filter={taskFilter} projectId={taskProjectId} tag={taskTag} onEdit={editTask} />`
- Line ~748: `<LearningList userId={user.id} selectedTag={selectedLearningTag} onEdit={editLearning} />`
- Line ~761 (the `<NotesList … />` element): add `onEdit={editNote}` to its props.

- [ ] **Step 6: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-22-pulse-edit-entries-qa-runbook.md`:

```markdown
# Edit Captured Entries — QA Runbook (on-device)

**Per list — Money, Tasks, Learn, Notes:**
1. Long-press a row → menu shows "✏️ Edit" above "🗑 Delete".
2. Tap Edit → the confirmation chip opens pre-filled with the row's current values.
3. The recurring toggle is HIDDEN (money + task); the confirm button reads "Save changes".
4. Change a field (money: amount/category/note; task: title/priority/due/tags/project; learning: text/tags/attribution; note: body/title/tags) → tap Save changes.
5. The chip closes and the list row reflects the change immediately.
6. Reload the app (new SW/session) → the change persisted (synced).

**Regressions:**
7. Normal capture (voice / text / receipt) still creates a NEW entry (does not overwrite).
8. Cancel on an edit chip discards changes and leaves the row unchanged.
9. With a capture chip already open, long-press → Edit does nothing (no clobber).
10. Editing does not create a recurring rule and does not spawn duplicates.
11. Money: editing an entry does not touch its receipt attachment or date.
```

- [ ] **Step 7: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors (the edit handlers are now used); tests pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/money-list.tsx src/components/task-list.tsx src/components/learning-list.tsx src/components/notes-list.tsx src/app/app/page.tsx docs/superpowers/notes/2026-07-22-pulse-edit-entries-qa-runbook.md
git commit -m "feat(edit): Edit menu item wired into all four lists + QA runbook"
```

---

## Post-implementation

- Opus whole-branch review (lenses: update-op correctness + editable-subset completeness; regression to the capture/create path; chip `mode` presentation + a11y; edit-clobber + concurrent-delete edges).
- Merge to `main` (auto-deploys); no D1 migration. Verify CI `success` + prod HTTP 200.
- Owner follow-up: run the QA runbook on-device (esp. steps 5–9).
