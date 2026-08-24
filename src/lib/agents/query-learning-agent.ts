import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildQueryLearningSystemPrompt } from './prompts/query-learning-agent'
import { QueryLearningResponseSchema, type QueryLearningResponse } from './schemas/query-learning-response'

type Args = {
  client: Groq
  text: string
  history?: string[]
  nowIso?: string
  userTz?: string
}

export async function parseLearningQuery({
  client, text, history, nowIso, userTz,
}: Args): Promise<QueryLearningResponse> {
  const system = buildQueryLearningSystemPrompt({
    nowIso: nowIso ?? new Date().toISOString(),
    userTz: userTz ?? 'UTC',
  })

  let userContent = text
  if (history && history.length > 0) {
    const recentMsgs = history.map(msg => `- ${msg}`).join('\n')
    userContent = `Recent messages:\n${recentMsgs}\n\nCurrent message: ${text}`
  }

  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-120b',
      system,
      user: userContent,
      temperature: 0,
      maxTokens: 256,
    }),
    { attempts: 3, baseMs: 500 },
  )

  const parsed = QueryLearningResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`query_learning: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
