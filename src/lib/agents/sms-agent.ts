import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildSmsAgentSystemPrompt } from './prompts/sms-agent'
import { SmsAgentResponseSchema, type SmsAgentResponse } from './schemas/sms-agent-response'

export async function parseSms({ client, text, defaultCurrency }: { client: Groq; text: string; defaultCurrency: string }): Promise<SmsAgentResponse> {
  const system = buildSmsAgentSystemPrompt(defaultCurrency)
  const raw = await withRetry(
    () => callGroqJSON<unknown>({ client, model: 'openai/gpt-oss-120b', system, user: text, temperature: 0, maxTokens: 256 }),
    { attempts: 3, baseMs: 500 },
  )
  const parsed = SmsAgentResponseSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`sms_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  return parsed.data
}
