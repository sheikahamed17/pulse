import { z } from 'zod'

export const TaskPayloadSchema = z.object({
  title:          z.string().min(1).max(200),
  due_at:         z.string().datetime().nullable().optional(),
  priority:       z.enum(['low', 'medium', 'high']).default('medium'),
  completed_at:   z.string().datetime().nullable().optional(),
  source:         z.enum(['voice', 'manual', 'recurring']),
  raw_input:      z.string().nullable().optional(),
  recur_period:   z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable().optional(),
  recur_interval: z.number().int().positive().nullable().optional(),
})

export type TaskPayload = z.infer<typeof TaskPayloadSchema>
