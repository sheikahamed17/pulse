import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { LEARNING_SYSTEM_PROMPT } from './prompts/learning'
import { LearningAgentResponseSchema, type LearningAgentResponse } from './schemas/learning-agent-response'

type Args = {
  client: Groq
  text: string
}

export async function parseLearning({
  client, text,
}: Args): Promise<LearningAgentResponse> {
  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-120b',
      system: LEARNING_SYSTEM_PROMPT,
      user: text,
      temperature: 0,
      maxTokens: 256,
    }),
    { attempts: 3, baseMs: 500 },
  )

  const parsed = LearningAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`learning_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
