import { z } from 'zod'

export const QueryTaskResponseSchema = z.object({
  status: z.enum(['open', 'overdue', 'done', 'all']).default('open'),
  period: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    label: z.string().min(1).max(40),
  }).nullable().default(null),
}).refine(
  v => !v.period || v.period.from < v.period.to,
  { message: 'period.from must be < period.to' },
)

export type QueryTaskResponse = z.infer<typeof QueryTaskResponseSchema>
