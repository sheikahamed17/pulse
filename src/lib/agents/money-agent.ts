import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildMoneyAgentSystemPrompt } from './prompts/money-agent'
import { MoneyAgentResponseSchema, type MoneyAgentResponse } from './schemas/money-agent-response'

type Args = {
  client: Groq
  text: string
  categories: Array<{ name: string; kind: 'spend' | 'income' }>
  nowIso?: string
  defaultCurrency?: string
}

export async function parseMoneyEntry({
  client, text, categories, nowIso, defaultCurrency,
}: Args): Promise<MoneyAgentResponse> {
  const system = buildMoneyAgentSystemPrompt({
    categories,
    nowIso: nowIso ?? new Date().toISOString(),
    defaultCurrency,
  })

  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'llama-3.1-70b-versatile',
      system,
      user: text,
      temperature: 0,
      maxTokens: 256,
    }),
    { attempts: 3, baseMs: 500 },
  )

  const parsed = MoneyAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`money_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
