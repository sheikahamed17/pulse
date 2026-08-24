import { z } from 'zod'

export const HabitLogPayloadSchema = z.object({
  habit_id: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type HabitLogPayload = z.infer<typeof HabitLogPayloadSchema>
