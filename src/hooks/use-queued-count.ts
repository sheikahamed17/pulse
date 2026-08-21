'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/dexie'

/**
 * Hook to track count of queued and failed voice + receipt captures.
 * Returns the sum of voice_queue and receipt_queue items with status in ['queued', 'failed'].
 * Returns 0 while loading.
 */
export function useQueuedCount(): number {
  return useLiveQuery(
    async () => {
      const voiceCount = await db.voice_queue
        .where('status')
        .anyOf(['queued', 'failed'])
        .count()
      const receiptCount = await db.receipt_queue
        .where('status')
        .anyOf(['queued', 'failed'])
        .count()
      return voiceCount + receiptCount
    },
    [],
    0, // default to 0 while loading
  ) ?? 0
}
