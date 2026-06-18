import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { enqueueVoice, drainVoiceQueue, __resetDrainGuardForTests } from '@/lib/voice-queue'

describe('voice-queue', () => {
  beforeEach(async () => { await resetDb(); __resetDrainGuardForTests() })

  it('enqueue persists a blob with status=queued', async () => {
    await enqueueVoice(new Blob(['x'], { type: 'audio/webm' }))
    const items = await db.voice_queue.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('queued')
  })

  it('drain calls the processor and marks done on success', async () => {
    await enqueueVoice(new Blob(['x']))
    const proc = vi.fn().mockResolvedValue({ ok: true })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    const items = await db.voice_queue.toArray()
    expect(items[0].status).toBe('done')
    expect(proc).toHaveBeenCalledTimes(1)
  })

  it('drain increments retry_count on failure and stops after maxRetries', async () => {
    await enqueueVoice(new Blob(['x']))
    const proc = vi.fn().mockRejectedValue(new Error('boom'))
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    expect(proc).toHaveBeenCalledTimes(3)
    const item = (await db.voice_queue.toArray())[0]
    expect(item.status).toBe('failed')
    expect(item.retry_count).toBe(3)
  })

  it('drain processes only queued items (skips done/failed)', async () => {
    await enqueueVoice(new Blob(['a']))
    await enqueueVoice(new Blob(['b']))
    const proc = vi.fn().mockResolvedValue({ ok: true })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    expect(proc).toHaveBeenCalledTimes(2)
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    expect(proc).toHaveBeenCalledTimes(2)
  })

  it('concurrent drain calls do not double-process items', async () => {
    await enqueueVoice(new Blob(['a']))
    const proc = vi.fn().mockResolvedValue({ ok: true })

    // Fire both drains without awaiting between them — the second one's guard
    // check happens synchronously before the first one's first await suspends.
    await Promise.all([
      drainVoiceQueue({ processBlob: proc, maxRetries: 3 }),
      drainVoiceQueue({ processBlob: proc, maxRetries: 3 }),
    ])

    expect(proc).toHaveBeenCalledTimes(1)
    const items = await db.voice_queue.toArray()
    expect(items[0].status).toBe('done')
  })
})
