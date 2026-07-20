import type { z } from 'zod'
import { MoneyPayloadSchema } from './money'
import { RecurringPayloadSchema } from './recurring'
import { CategoryPayloadSchema } from './category'
import { TaskPayloadSchema } from './task'
import { InsightPayloadSchema } from './insight'
import { LearningPayloadSchema } from './learning'
import { NotePayloadSchema } from './note'
import type { ENTITY_KINDS } from '@/types/ops'

export { MoneyPayloadSchema, RecurringPayloadSchema, CategoryPayloadSchema, TaskPayloadSchema, InsightPayloadSchema, LearningPayloadSchema, NotePayloadSchema }
export type { MoneyPayload } from './money'
export type { RecurringPayload } from './recurring'
export type { CategoryPayload } from './category'
export type { TaskPayload } from './task'
export type { InsightPayload } from './insight'
export type { LearningPayload } from './learning'
export type { NotePayload } from './note'

type Kind = typeof ENTITY_KINDS[number]

export function getPayloadSchemaForKind(kind: Kind): z.ZodTypeAny | null {
  switch (kind) {
    case 'money':    return MoneyPayloadSchema
    case 'recurring':return RecurringPayloadSchema
    case 'category': return CategoryPayloadSchema
    case 'task':     return TaskPayloadSchema
    case 'insight':  return InsightPayloadSchema
    case 'learning': return LearningPayloadSchema
    case 'note':     return NotePayloadSchema
    default:         return null
  }
}
