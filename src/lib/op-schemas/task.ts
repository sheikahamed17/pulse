import { z } from 'zod'

export const TaskPayloadSchema = z.object({
  title:        z.string().min(1).max(200),
  due_at:       z.string().datetime().nullable().optional(),
  priority:     z.enum(['low', 'medium', 'high']).default('medium'),
  completed_at: z.string().datetime().nullable().optional(),
  source:       z.enum(['voice', 'manual']),
  raw_input:    z.string().nullable().optional(),
})

export type TaskPayload = z.infer<typeof TaskPayloadSchema>
