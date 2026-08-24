import { z } from 'zod'

export const HabitPayloadSchema = z.object({
  name: z.string().min(1).max(40),
  icon: z.string().max(8).nullable().optional(),
  is_archived: z.literal(0).or(z.literal(1)).optional(),
  schedule: z.string().max(40).nullable().optional(),
})

export type HabitPayload = z.infer<typeof HabitPayloadSchema>
