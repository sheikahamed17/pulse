# Edit Captured Entries — Design

**Date:** 2026-07-22
**Status:** Approved (design)
**Feature:** Edit an existing money / task / learning / note entry in place, by reusing the `ConfirmationChip` in an edit mode that emits an op-log `update` op.

## Goal

Let the user fix a mis-captured entry (wrong amount, category, title, priority, due date, tags, text…) without deleting and re-creating it. Reuse the existing `ConfirmationChip` — already a full tap-to-edit form for all four kinds — pre-filled from the row, with confirm emitting an `update` op instead of `create`.

## Non-goals

- **Budget** is not edited via the chip — it has its own dedicated editor in `budget-section.tsx`. Out of scope.
- **No date/time editing.** The chip never exposed an `occurred_at` field (money/learning/note) and edits `due_at` but not creation time. Editing the record's date is a separate chip enhancement, deliberately out of scope.
- No new entity_kind / op-schema / migration / cron / dependency. Dexie stays v9. No sync-engine change — `update` ops with partial payloads are the established mechanism (task completion, sub-task rollup, and budget's `existing ? 'update' : 'create'` all use it), materialized by `materializeRow` per-field HLC LWW on client and server.

## Architecture

The app page (`src/app/app/page.tsx`) already owns the chip (`draft` state) and `confirmEntry`. Additions:

1. **`editId: string | null`** page state. Non-null ⇒ the chip is editing that entity; null ⇒ normal capture.
2. **Four pure mappers** (`src/lib/entry-to-draft.ts`) `Row → Extract<ChipDraft, {kind}>`.
3. **`onEdit?` prop** on each of the four list components (they are direct children of the page). The existing long-press menu (kept in the swipe-delete feature, rendered as a sibling of `SwipeRow` under the `relative` `<li>`) gains an "✏️ Edit" item above "🗑 Delete".
4. **`ConfirmationChip` gains `mode?: 'create' | 'edit'`** (default `'create'`): edit mode hides the recurring toggle and relabels the confirm button "Save changes". No other change — all fields are already editable.
5. **`confirmEntry` branches on `editId`:** when set, delegate to a new `updateEntry(final, editId)` that emits one `update` op with the editable-subset payload; when null, the existing create path is untouched.

Flow:

```
list long-press menu → "✏️ Edit" → onEdit(row)
  → page.editX(row): if a chip is already open, no-op; else setEditId(row.id); setDraft(xRowToDraft(row))
  → <ConfirmationChip mode="edit"> opens, pre-filled (recurring hidden, "Save changes")
  → user tweaks fields → confirm → confirmEntry sees editId → updateEntry → update op
  → setDraft(null); setEditId(null); pushPullOnce
```

### Unit — `src/lib/entry-to-draft.ts` (pure, tested)

```ts
moneyRowToDraft(r: MoneyEntryRow): Extract<ChipDraft, { kind: 'money' }>
taskRowToDraft(r: TaskRow): Extract<ChipDraft, { kind: 'task' }>
learningRowToDraft(r: LearningRow): Extract<ChipDraft, { kind: 'learning' }>
noteRowToDraft(r: NoteRow): Extract<ChipDraft, { kind: 'note' }>
```

Each copies the domain fields into the payload shape + `kind`. `r.currency` (typed `string` on the row) is cast to `Currency` for the money draft. Row `tags` are passed through with `?? []` (legacy-null safety). No id/user_id/timestamps/field_hlcs in the draft.

### `ConfirmationChip` `mode`

`ConfirmationChip` forwards `mode` to each sub-chip. Each sub-chip derives `const isEdit = mode === 'edit'`:
- **Money:** hide the "Make recurring" block when `isEdit`; button label `isEdit ? 'Save changes' : \`Confirm ${symbol}${major}\``.
- **Task:** hide the "Repeat after completion" block when `isEdit`; button label `isEdit ? 'Save changes' : 'Confirm task'`.
- **Learning / Note:** button label `isEdit ? 'Save changes' : 'Confirm learning|note'` (no recurring block to hide).
- **Budget:** unused in edit; unchanged.

The chip never learns *which* row it edits or that persistence is an update — it stays presentational. The page owns the create-vs-update decision.

### `confirmEntry` / `updateEntry`

```
confirmEntry(final, recurring):
  if (!user) return
  if (editId) { await updateEntry(final, editId); return }
  …existing create logic, untouched…

updateEntry(final, id):
  editable subset per kind →
    money    → { amount, currency, direction, category_id, description }
    task     → { title, due_at, priority, tags, project_id }
    learning → { text, tags, attribution }
    note     → { body, title, tags }
  generateOp({ entity_kind, entity_id: id, op_type: 'update', payload, user_id })
  → applyLocalOp → setDraft(null); setEditId(null); pushPullOnce
```

`updateEntry` skips recurring-rule creation, tab-switching, the due-date push nudge, and receipt-draft deletion — those are capture-time concerns. Fields not in the subset (`occurred_at`, `source`, `raw_input`, `receipt_key`, `completed_at`, `parent_id`, `recur_*`, `recurring_rule_id`) are left untouched by LWW.

### Edit affordance in lists

Each list gets `onEdit?: (row) => void`. The long-press menu gains, above Delete:

```tsx
{onEdit && (
  <button type="button" aria-label={`Edit …`}
    className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
    onClick={() => { onEdit(row); setMenuFor(null) }}>
    <Pencil className="w-3 h-3" /> Edit
  </button>
)}
```

`Pencil` from `lucide-react`. The page passes `onEdit={editMoney}` etc.

## Data flow

Row → `xRowToDraft` → chip `d` state → user edits → `onConfirm(d)` → `confirmEntry` → `updateEntry` → `update` op → `applyLocalOp` (client Dexie LWW) → `pushPullOnce` → server `materializeRow` LWW. Reuses the entire existing pipeline; only the op_type and payload subset differ from capture.

## Error handling

- `updateEntry` reuses `generateOp`/`applyLocalOp`/`pushPullOnce` (sync errors already caught + logged).
- **Concurrent delete race:** editing a row deleted on another device before sync. The op-log engine (`op-log.ts` `applyUpdate`) *intentionally* resurrects — an `update` with an HLC later than `deleted_at` clears the tombstone (an explicit, pre-existing LWW rule that applies to every update op in the app, not just edit). So a later edit un-deletes the row, carrying the edits. This is a rare concurrent edge with a defensible outcome (the user's most-recent action wins) and is **not** specific to this feature; no engine change is made here.
- **Chip already open:** `editX` no-ops when `draft !== null`, so opening an edit never clobbers an in-progress capture or another edit.
- Cancel clears both `draft` and `editId`.

## Testing

**Unit (`tests/lib/entry-to-draft.test.ts`)** — the four mappers: full-field mapping per kind + null/empty edge cases (money `category_id`/`description` null; task `due_at`/`project_id` null + legacy `tags` undefined → `[]`; learning `attribution` null; note `title` null). ~6 tests.

**Integration (`tests/edit-update-roundtrip.test.ts`)** — `applyLocalOp` create-then-update, mirroring `tests/task-tags-project.test.ts`:
- money: update `{amount, category_id, description}` changes those; `occurred_at` + `source` preserved.
- task: update `{title, priority, tags, project_id}` changes those; `completed_at` + `source` preserved.
2 tests.

**Chip edit-mode + list wiring** — QA-runbook-verified on device (`docs/superpowers/notes/2026-07-22-pulse-edit-entries-qa-runbook.md`): Edit menu item opens the pre-filled chip; recurring hidden; "Save changes" persists; the list reflects the change; capture still works (create path untouched); one chip at a time.

## Plan shape

~4 tasks: (1) pure `entry-to-draft.ts` + mapper tests; (2) `ConfirmationChip` `mode` prop; (3) `editId` + `updateEntry` + edit handlers in page + update round-trip tests; (4) `onEdit` prop + "Edit" menu item in all four lists + QA runbook. Opus whole-branch review at the end (lenses: update-op correctness / field-subset completeness; regression to capture/create path; chip mode presentation + a11y; edit-clobber and concurrent-delete edges).

## Constraints (verbatim)

- Locked stack; **no new dependency** (`Pencil` is already in `lucide-react`).
- No entity_kind / op-schema / migration / cron / sync-engine change. Dexie v9.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
- Gate UN-CHAINED (`pnpm typecheck` / `lint` / `test` / `build`).
- Reuse `ConfirmationChip`; do not build new edit forms. Chip stays presentational (no persistence knowledge).
- Editable subsets exactly as listed above; leave all other fields untouched.
