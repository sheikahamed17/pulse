# Drained-Receipt Chip — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design), pending spec review → implementation plan
**Feature:** Surface the parsed result of a background-drained offline receipt as the normal confirmation chip, instead of discarding it.

## Problem

Receipts captured while offline are enqueued (`enqueueReceipt` → `receipt_queue` Dexie store) and drained when the device comes back online (`drainReceiptQueue`, wired in `src/app/app/page.tsx`). The drain calls `callReceiptApiStreaming(blob, () => {})`, which uploads the image to R2 and runs the Llama-4-Scout vision parse server-side — but the parsed money payload is **intentionally discarded** at `page.tsx:335` (only `{ ok: true }` is checked). The R2 image is preserved and viewable, but the parse — the whole point of the capture — vanishes. The user's offline receipt produces no money entry and no prompt to create one.

The online path already does this correctly: `ReceiptButton` → `/api/receipt` (SSE) → `onParsed(payload, previewUrl)` → `setDraft(...)` → `<ConfirmationChip>` → `confirmEntry` → money op. The gap is only in the **offline drain path**.

## Goal

A receipt that parses in the background reappears as the same `ConfirmationChip` the online path uses, so the user can confirm (or edit/discard) the money entry. Because a drain runs "when back online" — possibly while the app is backgrounded, on the lock screen, or in a later session — the parsed draft must be **persisted** (Dexie), not held in React state, so it survives the reload a drain frequently coincides with.

## Global Constraints

- Locked stack (Next 16 / React 19 / Dexie v4 / TS / Tailwind 4). No new dependencies.
- **No op-schema / entity_kind / server / D1-migration / sync changes.** The `receipt_key` reference already flows end-to-end through `MoneyPayloadSchema` (`src/lib/op-schemas/money.ts`) and `MoneyEntryRow`; the money-commit path is unchanged.
- The persisted drafts store is **client-only** (like `voice_queue` / `receipt_queue`): a Dexie store with NO op-log, NO server materialization, NO sync. It does NOT trigger the "new entity_kind needs server + client materialize" rule — that rule is for *synced* entities only.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
- Terse, code-first style; match surrounding patterns.

## Architecture

Three units, each with one responsibility:

1. **`src/lib/receipt-drafts.ts` (new)** — the persistence layer for drained drafts. Pure/Dexie helpers, testable in isolation with `fake-indexeddb`:
   - `type ReceiptDraftRow = { id: string; payload: MoneyPayload; created_at: string }` (payload carries `receipt_key`).
   - `saveReceiptDraft(payload: MoneyPayload): Promise<string>` — insert a row with a generated id + ISO `created_at`; return the id.
   - `listReceiptDrafts(): Promise<ReceiptDraftRow[]>` — all rows, oldest `created_at` first.
   - `deleteReceiptDraft(id: string): Promise<void>` — remove a row.
   - `pickNextReceiptDraft(rows: ReceiptDraftRow[]): ReceiptDraftRow | null` — PURE: the oldest row (by `created_at`, tie-break by `id`) or null. Extracted so the "which draft pops next" decision is unit-tested without IndexedDB.

2. **`src/lib/dexie.ts`** — add the `receipt_drafts` store at a new `this.version(8).stores({ receipt_drafts: 'id, created_at' })`; add `receipt_drafts!: EntityTable<ReceiptDraftRow, 'id'>` to the class and clear it in the test `resetDb()` helper. (Adding a store is a pure client-side Dexie upgrade — new empty store, no data migration.)

3. **`src/app/app/page.tsx`** — the wiring (kept thin):
   - **Drain callback** (currently `page.tsx:~335`): replace the discard with `const final = await callReceiptApiStreaming(blob, () => {}); if (!final) throw new Error('receipt drain failed'); await saveReceiptDraft(final.payload as MoneyPayload); return { ok: true }`. The queue item is then marked `done` by the existing drain loop (blob freed).
   - **Surfacing effect**: keyed on `[draft, parsing, queryPlan, drainTick]`. When `draft === null && !parsing && queryPlan === null`, load `pickNextReceiptDraft(await listReceiptDrafts())`; if present, `setDraft({ ...row.payload, kind: 'money', draftId: row.id, receiptPreviewUrl: row.payload.receipt_key ? '/api/receipt/' + row.payload.receipt_key : undefined })`. Re-runs when `draft` returns to null (after confirm/cancel), producing a natural one-at-a-time queue. `drainTick` is a `useState<number>` counter the drain callback increments (`setDrainTick(t => t + 1)`) after `saveReceiptDraft` succeeds, so a freshly-drained draft pops without waiting for an unrelated re-render.
   - **`confirmEntry`**: unchanged money-commit; then `if (draft.draftId) await deleteReceiptDraft(draft.draftId)`.
   - **Cancel handler**: `onCancel={() => { if (draft?.draftId) deleteReceiptDraft(draft.draftId); setDraft(null) }}` — cancel permanently dismisses the drained draft (R2 image left as-is; orphan cleanup is out of scope for v1).

4. **`src/components/confirmation-chip.tsx`** — add optional `draftId?: string` to the `ChipDraft` type so it flows through to the page's confirm/cancel handlers. The chip already renders `receiptPreviewUrl` via `next/image unoptimized`; the R2 viewer URL (`/api/receipt/{receipt_key}`, authenticated, tenant-isolated — already built at `src/app/api/receipt/[...key]/route.ts`) is passed there. No other chip change.

## Data Flow

```
offline capture ─ enqueueReceipt(blob) ─▶ receipt_queue (Dexie)
        │
   back online / app open
        ▼
drainReceiptQueue.processBlob(blob)
   → callReceiptApiStreaming → /api/receipt (R2 upload + vision parse)
   → saveReceiptDraft(payload)  ──▶ receipt_drafts (Dexie, persisted)
   → queue item marked 'done' (blob freed)
        │
   surfacing effect (draft===null && !parsing && !queryPlan)
        ▼
   setDraft({ ...payload, draftId, receiptPreviewUrl: /api/receipt/<key> })
        ▼
   <ConfirmationChip>  ──Confirm──▶ confirmEntry (money op, receipt_key) + deleteReceiptDraft
                       ──Cancel───▶ deleteReceiptDraft (dismiss) + setDraft(null)
        │  (draft → null)
        └────────────▶ effect pops the next draft (one at a time)
```

## Error Handling

- Drain parse failure (`final` null / network): unchanged — the existing `drainReceiptQueue` retry/`maxRetries` logic applies (no draft saved; the queue item retries or eventually goes `failed`). `saveReceiptDraft` only runs on a successful parse.
- `saveReceiptDraft` throwing inside the drain callback propagates as a processBlob failure → the queue retries (idempotency: a re-drain re-uploads to a new R2 key + saves a new draft; acceptable — worst case a duplicate chip the user can cancel; drains are rare and bounded by `maxRetries`).
- Surfacing effect reads are guarded by `draft === null`; a corrupt/legacy row that fails to render is deleted on cancel like any other.

## Testing

TDD the isolated units (mirrors `tests/lib/receipt-queue.test.ts` style):

- `tests/lib/receipt-drafts.test.ts` (fake-indexeddb):
  - `saveReceiptDraft` inserts a row with the payload + a `created_at`; returns the id.
  - `listReceiptDrafts` returns rows oldest-first.
  - `deleteReceiptDraft` removes the row.
  - `pickNextReceiptDraft` (pure): oldest by `created_at`; tie-break by id; `[]` → null.
  - Round-trip: save two drafts → pickNext returns the older → delete it → pickNext returns the second → delete → null.

Page-effect wiring (drain callback, surfacing effect, confirm/cancel deletion) stays thin and is verified via the QA runbook (the existing `voice-queue`/`receipt-queue` drains are likewise tested at the queue-logic level, not through the page effect — the repo has no React-render test harness). QA runbook to add: `docs/superpowers/notes/2026-07-21-pulse-drained-receipt-qa-runbook.md`.

## Out of Scope (v1)

- Orphaned-R2 cleanup on discard (a DELETE endpoint) — deferred; discarded receipts leave their image in R2 (harmless, tenant-isolated).
- A "N receipts ready" badge/tray — the chosen UX is auto-pop; no separate review surface.
- Cross-tab drain coordination beyond the existing in-process `isDraining` guard + `withWebLock('pulse-receipt-drain', …)` wrapper.
