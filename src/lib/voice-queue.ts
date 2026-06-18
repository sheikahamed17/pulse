import { db } from '@/lib/dexie'

export async function enqueueVoice(blob: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await db.voice_queue.put({
    id, blob,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'queued',
  } as never)
  return id
}

type DrainArgs = {
  processBlob: (blob: Blob) => Promise<{ ok: boolean }>
  maxRetries: number
}

export async function drainVoiceQueue({ processBlob, maxRetries }: DrainArgs): Promise<void> {
  const items = await db.voice_queue.where('status').equals('queued').toArray()
  for (const item of items) {
    await db.voice_queue.update(item.id, { status: 'transcribing' })
    try {
      await processBlob(item.blob)
      await db.voice_queue.update(item.id, { status: 'done' })
    } catch (err) {
      const nextCount = item.retry_count + 1
      const failed = nextCount >= maxRetries
      await db.voice_queue.update(item.id, {
        status: failed ? 'failed' : 'queued',
        retry_count: nextCount,
      })
      console.warn('voice-queue: process failed', err)
    }
  }
}
