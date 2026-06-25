import { z } from 'zod'

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD', 'CAD'] as const
export type Currency = typeof SUPPORTED_CURRENCIES[number]

export const MoneyPayloadSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_id: z.string().min(1).nullable().optional(),
  description: z.string().max(120).nullable().optional(),
  occurred_at: z.string().datetime(),
  source: z.enum(['voice', 'manual', 'recurring']),
  raw_input: z.string().nullable().optional(),
  recurring_rule_id: z.string().min(1).nullable().optional(),
})

export type MoneyPayload = z.infer<typeof MoneyPayloadSchema>
