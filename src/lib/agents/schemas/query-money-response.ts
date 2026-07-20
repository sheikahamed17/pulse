import { z } from 'zod'

export const QueryMoneyResponseSchema = z.object({
  direction: z.enum(['out', 'in']).default('out'),
  category_name: z.string().min(1).nullable(),
  mode: z.enum(['total', 'breakdown', 'delta', 'series']).default('total'),
  bucket: z.enum(['day', 'week', 'month']).optional(),
  period: z.object({
    from:  z.string().datetime(),
    to:    z.string().datetime(),
    label: z.string().min(1).max(40),
  }),
}).refine(
  v => v.period.from < v.period.to,
  { message: 'period.from must be < period.to' },
)

export type QueryMoneyResponse = z.infer<typeof QueryMoneyResponseSchema>
