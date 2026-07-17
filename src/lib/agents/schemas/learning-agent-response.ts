import { z } from 'zod'

export const LearningAgentResponseSchema = z.object({
  text: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  attribution: z.string().max(200).nullable().optional(),
})

export type LearningAgentResponse = z.infer<typeof LearningAgentResponseSchema>
