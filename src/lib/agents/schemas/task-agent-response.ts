import { z } from 'zod'

export const TaskAgentResponseSchema = z.object({
  title:    z.string().min(1).max(200),
  due_at:   z.string().datetime().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
})

export type TaskAgentResponse = z.infer<typeof TaskAgentResponseSchema>
