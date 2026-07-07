import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildQueryMoneySystemPrompt } from './prompts/query-money-agent'
import { QueryMoneyResponseSchema, type QueryMoneyResponse } from './schemas/query-money-response'

type Args = {
  client: Groq
  text: string
  categories: Array<{ name: string; kind: 'spend' | 'income' }>
  nowIso?: string
  userTz?: string
}

export async function parseMoneyQuery({
  client, text, categories, nowIso, userTz,
}: Args): Promise<QueryMoneyResponse> {
  const system = buildQueryMoneySystemPrompt({
    nowIso: nowIso ?? new Date().toISOString(),
    userTz: userTz ?? 'UTC',
    categories,
  })

  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-120b',
      system,
      user: text,
      temperature: 0,
      maxTokens: 256,
    }),
    { attempts: 3, baseMs: 500 },
  )

  const parsed = QueryMoneyResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`query_money: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
