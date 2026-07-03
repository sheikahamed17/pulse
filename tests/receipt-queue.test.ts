import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { enqueueReceipt, drainReceiptQueue, __resetReceiptDrainGuardForTests } from '@/lib/receipt-queue'
import { db, resetDb } from '@/lib/dexie'

describe('receipt-queue', () => {
  beforeEach(async () => {
    await resetDb()
    __resetReceiptDrainGuardForTests()
  })

  it('enqueues a blob into receipt_queue', async () => {
    const blob = new Blob(['data'], { type: 'image/jpeg' })
    await enqueueReceipt(blob)

    const items = await db.receipt_queue.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('queued')
    expect(items[0].retry_count).toBe(0)
  })

  it('drains queued items via processBlob', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    await enqueueReceipt(blob)

    const processed: Blob[] = []
    await drainReceiptQueue({
      processBlob: async (b) => {
        processed.push(b)
        return { ok: true }
      },
      maxRetries: 3,
    })

    expect(processed).toHaveLength(1)
    const items = await db.receipt_queue.toArray()
    expect(items[0].status).toBe('done')
  })

  it('retries a failed item on the next drain (one attempt per drain)', async () => {
    const blob = new Blob(['x'])
    await enqueueReceipt(blob)

    let attempts = 0
    const processBlob = async () => {
      attempts++
      if (attempts < 2) throw new Error('transient')
      return { ok: true }
    }

    // Single-pass drain (mirrors voice-queue): each call attempts each queued
    // item exactly once. Drain #1 fails and requeues; drain #2 succeeds.
    await drainReceiptQueue({ processBlob, maxRetries: 3 })
    await drainReceiptQueue({ processBlob, maxRetries: 3 })

    expect(attempts).toBe(2)
    const items = await db.receipt_queue.toArray()
    expect(items[0].status).toBe('done')
    expect(items[0].retry_count).toBe(1)
  })

  it('marks an item failed after maxRetries drains exhaust it', async () => {
    const blob = new Blob(['x'])
    await enqueueReceipt(blob)

    const proc = vi.fn().mockRejectedValue(new Error('always fails'))

    // maxRetries=2: drain #1 → retry_count 1 (requeued), drain #2 → retry_count 2
    // (failed). Drain #3 finds no queued items and does not call proc — proving a
    // failed item is never re-attempted. Mirrors the voice-queue failure test.
    await drainReceiptQueue({ processBlob: proc, maxRetries: 2 })
    await drainReceiptQueue({ processBlob: proc, maxRetries: 2 })
    await drainReceiptQueue({ processBlob: proc, maxRetries: 2 })

    expect(proc).toHaveBeenCalledTimes(2)
    const items = await db.receipt_queue.toArray()
    expect(items[0].status).toBe('failed')
    expect(items[0].retry_count).toBe(2)
  })

  it('concurrent drain calls do not double-process items', async () => {
    await enqueueReceipt(new Blob(['x'], { type: 'image/jpeg' }))
    const proc = vi.fn().mockResolvedValue({ ok: true })

    // Fire both drains without awaiting between them — the second one's guard
    // check runs synchronously before the first one's first await suspends, so
    // the second returns immediately and only one drain processes the item.
    await Promise.all([
      drainReceiptQueue({ processBlob: proc, maxRetries: 3 }),
      drainReceiptQueue({ processBlob: proc, maxRetries: 3 }),
    ])

    expect(proc).toHaveBeenCalledTimes(1)
    const items = await db.receipt_queue.toArray()
    expect(items[0].status).toBe('done')
  })
})
