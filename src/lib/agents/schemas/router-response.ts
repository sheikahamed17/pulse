import { z } from 'zod'

export const INTENTS = ['log_money', 'query_money', 'chat'] as const

export const RouterResponseSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
})

export type RouterResponse = z.infer<typeof RouterResponseSchema>
