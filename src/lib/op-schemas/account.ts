import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from './money'

export const AccountPayloadSchema = z.object({
  name: z.string().min(1).max(40),
  type: z.enum(['asset', 'liability']),
  opening_balance: z.number().int(),   // minor units, may be negative, in `currency`
  currency: z.enum(SUPPORTED_CURRENCIES),
  icon: z.string().max(8).nullable().optional(),
  is_archived: z.literal(0).or(z.literal(1)).optional(),
})

export type AccountPayload = z.infer<typeof AccountPayloadSchema>
