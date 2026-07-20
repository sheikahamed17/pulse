import { z } from 'zod'

export const INTENTS = ['log_money', 'log_task', 'query_money', 'query_task', 'query_learning', 'query_notes', 'chat', 'log_learning', 'log_note'] as const

export const RouterResponseSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
})

export type RouterResponse = z.infer<typeof RouterResponseSchema>
