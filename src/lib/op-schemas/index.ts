import type { z } from 'zod'
import { MoneyPayloadSchema } from './money'
import { RecurringPayloadSchema } from './recurring'
import { CategoryPayloadSchema } from './category'
import type { ENTITY_KINDS } from '@/types/ops'

export { MoneyPayloadSchema, RecurringPayloadSchema, CategoryPayloadSchema }
export type { MoneyPayload } from './money'
export type { RecurringPayload } from './recurring'
export type { CategoryPayload } from './category'

type Kind = typeof ENTITY_KINDS[number]

export function getPayloadSchemaForKind(kind: Kind): z.ZodTypeAny | null {
  switch (kind) {
    case 'money':    return MoneyPayloadSchema
    case 'recurring':return RecurringPayloadSchema
    case 'category': return CategoryPayloadSchema
    default:         return null
  }
}
