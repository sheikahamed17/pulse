import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from './money'

export const RecurringPayloadSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_id: z.string().min(1).nullable().optional(),
  description: z.string().max(120).nullable().optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval_count: z.number().int().positive(),
  anchor_at: z.string().datetime(),
  next_due_at: z.string().datetime(),
  end_condition_kind: z.enum(['never', 'until', 'count']),
  end_until: z.string().datetime().nullable().optional(),
  end_count: z.number().int().positive().nullable().optional(),
  occurrences_so_far: z.number().int().nonnegative().optional(),
  is_active: z.union([z.literal(0), z.literal(1)]),
}).refine(
  (v) => v.end_condition_kind !== 'until' || !!v.end_until,
  { message: 'end_until is required when end_condition_kind = "until"' },
).refine(
  (v) => v.end_condition_kind !== 'count' || !!v.end_count,
  { message: 'end_count is required when end_condition_kind = "count"' },
)

export type RecurringPayload = z.infer<typeof RecurringPayloadSchema>
