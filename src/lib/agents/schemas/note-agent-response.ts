import { z } from 'zod'

export const NoteAgentResponseSchema = z.object({
  title: z.string().max(200).nullable(),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
})

export type NoteAgentResponse = z.infer<typeof NoteAgentResponseSchema>
