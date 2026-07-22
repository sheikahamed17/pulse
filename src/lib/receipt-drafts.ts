import { db, type ReceiptDraftRow } from '@/lib/dexie'
import type { MoneyPayload } from '@/lib/op-schemas/money'

// Persistence for receipts parsed by the background drain. A distinct concept from
// the upload queue: once parsed, R2 holds the image (payload.receipt_key), so the
// blob is dropped and only the draft persists until the user confirms/dismisses it.
// Client-only — NOT synced (no op-log, no server materialize).

export async function saveReceiptDraft(payload: MoneyPayload): Promise<string> {
  const id = crypto.randomUUID()
  await db.receipt_drafts.put({ id, payload, created_at: new Date().toISOString() })
  return id
}

export async function listReceiptDrafts(): Promise<ReceiptDraftRow[]> {
  return db.receipt_drafts.orderBy('created_at').toArray()
}

export async function deleteReceiptDraft(id: string): Promise<void> {
  await db.receipt_drafts.delete(id)
}

/** PURE: the oldest draft (by created_at, tie-break by id) or null. */
export function pickNextReceiptDraft(rows: ReceiptDraftRow[]): ReceiptDraftRow | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) =>
    a.created_at === b.created_at
      ? (a.id < b.id ? -1 : 1)
      : (a.created_at < b.created_at ? -1 : 1),
  )[0]
}
