import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from './money'

export const BudgetPayloadSchema = z.object({
  category_id: z.string().min(1),
  amount: z.number().int().positive(),   // minor units (e.g. paise/cents), in `currency`
  currency: z.enum(SUPPORTED_CURRENCIES),
})

export type BudgetPayload = z.infer<typeof BudgetPayloadSchema>
