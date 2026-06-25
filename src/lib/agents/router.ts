import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { ROUTER_SYSTEM_PROMPT } from './prompts/router'
import { RouterResponseSchema, type RouterResponse } from './schemas/router-response'

type Args = {
  client: Groq
  text: string
}

export async function routeIntent({ client, text }: Args): Promise<RouterResponse> {
  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'llama-3.1-8b-instant',
      system: ROUTER_SYSTEM_PROMPT,
      user: text,
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
