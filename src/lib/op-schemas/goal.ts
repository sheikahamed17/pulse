import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from './money'

export const GoalPayloadSchema = z.object({
  name: z.string().min(1).max(40),
  target_amount: z.number().int().min(0),
  currency: z.enum(SUPPORTED_CURRENCIES),
  icon: z.string().max(8).nullable().optional(),
  account_id: z.string().min(1).nullable().optional(),
  saved_amount: z.number().int().min(0).optional(),
  target_date: z.string().nullable().optional(),
  is_archived: z.literal(0).or(z.literal(1)).optional(),
})

export type GoalPayload = z.infer<typeof GoalPayloadSchema>
