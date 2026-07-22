import { z } from 'zod'

export const ProjectPayloadSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().max(32).nullable().optional(),
  archived: z.union([z.literal(0), z.literal(1)]),
})

export type ProjectPayload = z.infer<typeof ProjectPayloadSchema>
