import { z } from 'zod'

export const LearningPayloadSchema = z.object({
  text: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  attribution: z.string().max(200).nullable().optional(),
  occurred_at: z.string().datetime(),
  source: z.enum(['voice', 'manual']),
})

export type LearningPayload = z.infer<typeof LearningPayloadSchema>
