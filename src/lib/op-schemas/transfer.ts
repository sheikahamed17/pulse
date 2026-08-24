import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from './money'

export const TransferPayloadSchema = z.object({
  from_account_id: z.string().min(1),
  to_account_id: z.string().min(1),
  amount: z.number().int().min(1),
  currency: z.enum(SUPPORTED_CURRENCIES),
  occurred_at: z.string(),
  note: z.string().max(120).nullable().optional(),
})

export type TransferPayload = z.infer<typeof TransferPayloadSchema>
