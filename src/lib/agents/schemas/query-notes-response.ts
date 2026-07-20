import { z } from 'zod'

export const QueryNotesResponseSchema = z.object({
  search: z.string().nullable().default(null),
  tags: z.array(z.string().min(1).max(50)).default([]),
  period: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    label: z.string().min(1).max(40),
  }).nullable().default(null),
}).refine(
  v => !v.period || v.period.from < v.period.to,
  { message: 'period.from must be < period.to' },
).strict()

export type QueryNotesResponse = z.infer<typeof QueryNotesResponseSchema>
