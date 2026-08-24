import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { ROUTER_SYSTEM_PROMPT } from './prompts/router'
import { RouterResponseSchema, type RouterResponse } from './schemas/router-response'

type Args = {
  client: Groq
  text: string
  history?: string[]
}

export async function routeIntent({ client, text, history }: Args): Promise<RouterResponse> {
  let userContent = text
  if (history && history.length > 0) {
    const recentMsgs = history.map(msg => `- ${msg}`).join('\n')
    userContent = `Recent messages:\n${recentMsgs}\n\nCurrent message: ${text}`
  }

  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-20b',
      system: ROUTER_SYSTEM_PROMPT,
      user: userContent,
      temperature: 0,
      maxTokens: 64,
    }),
    { attempts: 3, baseMs: 300 },
  )

  const parsed = RouterResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`router: invalid response shape — ${parsed.error.message}`)
  }
  return parsed.data
}
