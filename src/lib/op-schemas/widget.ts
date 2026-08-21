import { z } from 'zod'

export const WidgetPayloadSchema = z.object({
  type: z.string().nullable(),
  sort_order: z.number().int().nonnegative(),
  label: z.string().nullable().optional(),
})

export type WidgetPayload = z.infer<typeof WidgetPayloadSchema>
