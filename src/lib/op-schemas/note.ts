import { z } from 'zod'

export const NotePayloadSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(10000),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  occurred_at: z.string().datetime(),
  source: z.enum(['voice', 'manual']),
})

export type NotePayload = z.infer<typeof NotePayloadSchema>
