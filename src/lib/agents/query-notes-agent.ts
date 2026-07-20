import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildQueryNotesSystemPrompt } from './prompts/query-notes-agent'
import { QueryNotesResponseSchema, type QueryNotesResponse } from './schemas/query-notes-response'

type Args = {
  client: Groq
  text: string
  nowIso?: string
  userTz?: string
}

export async function parseNotesQuery({
  client, text, nowIso, userTz,
}: Args): Promise<QueryNotesResponse> {
  const system = buildQueryNotesSystemPrompt({
    nowIso: nowIso ?? new Date().toISOString(),
    userTz: userTz ?? 'UTC',
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

  const parsed = QueryNotesResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`query_notes: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
