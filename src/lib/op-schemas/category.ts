import { z } from 'zod'

export const CategoryPayloadSchema = z.object({
  name: z.string().min(1).max(40),
  kind: z.enum(['spend', 'income']),
  icon: z.string().max(8).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  sort_order: z.number().int().nonnegative(),
  is_archived: z.union([z.literal(0), z.literal(1)]).optional(),
})

export type CategoryPayload = z.infer<typeof CategoryPayloadSchema>
