import { z } from 'zod'

export const SmsAgentResponseSchema = z.object({
  is_transaction: z.boolean(),
  amount: z.number().int().nonnegative().optional(),  // minor units (paise/cents; whole for JPY)
  currency: z.string().min(3).max(3).optional(),
  direction: z.enum(['out', 'in']).optional(),
  merchant: z.string().max(120).nullable().optional(),
})

export type SmsAgentResponse = z.infer<typeof SmsAgentResponseSchema>
