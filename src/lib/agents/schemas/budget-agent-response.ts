import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export const BudgetAgentResponseSchema = z.object({
  category_name: z.string().min(1),
  amount: z.number().int().positive(),   // minor units
  currency: z.enum(SUPPORTED_CURRENCIES),
})

export type BudgetAgentResponse = z.infer<typeof BudgetAgentResponseSchema>
