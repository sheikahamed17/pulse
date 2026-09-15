import { z } from 'zod'

// A daily journal entry: free-text body + an optional mood (an emoji or short
// key). occurred_at is the day it's for; source is how it was captured.
export const JournalPayloadSchema = z.object({
  body: z.string().max(5000),
  mood: z.string().max(8).nullable().optional(),
  occurred_at: z.string().datetime(),
  source: z.enum(['voice', 'manual']),
})

export type JournalPayload = z.infer<typeof JournalPayloadSchema>
