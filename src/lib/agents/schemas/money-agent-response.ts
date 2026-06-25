import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export const MoneyAgentResponseSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_name: z.string().min(1).nullable(),
  description: z.string().max(120).nullable(),
  occurred_at: z.string().datetime(),
})

export type MoneyAgentResponse = z.infer<typeof MoneyAgentResponseSchema>
