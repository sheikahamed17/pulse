import { db } from '@/lib/dexie'

export async function enqueueReceipt(blob: Blob): Promise<void> {
  const id = crypto.randomUUID()
  await db.receipt_queue.put({
    id,
    blob,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'queued',
  } as never)
}

type DrainArgs = {
  processBlob: (blob: Blob) => Promise<{ ok: boolean }>
  maxRetries: number
}

// In-process guard against concurrent drains. The `online` event + first-mount
// effect can both fire `drainReceiptQueue()` overlapping; without this guard,
// both reads see the same `queued` items before either marks them
// `processing`, double-processing the blob.
let isDraining = false

export function __resetReceiptDrainGuardForTests() {
  isDraining = false
}

export async function drainReceiptQueue({ processBlob, maxRetries }: DrainArgs): Promise<void> {
  if (isDraining) return
  isDraining = true
  try {
    const items = await db.receipt_queue.where('status').equals('queued').toArray()
    for (const item of items) {
      await db.receipt_queue.update(item.id, { status: 'processing' })
      try {
        await processBlob(item.blob)
        await db.receipt_queue.update(item.id, { status: 'done' })
      } catch (err) {
        const nextCount = item.retry_count + 1
        const failed = nextCount >= maxRetries
        await db.receipt_queue.update(item.id, {
          status: failed ? 'failed' : 'queued',
          retry_count: nextCount,
        })
        console.warn('receipt-queue: process failed', err)
      }
    }
  } finally {
    isDraining = false
  }
}
