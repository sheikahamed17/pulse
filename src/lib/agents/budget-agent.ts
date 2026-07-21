import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildBudgetAgentSystemPrompt } from './prompts/budget-agent'
import { BudgetAgentResponseSchema, type BudgetAgentResponse } from './schemas/budget-agent-response'

type Args = {
  client: Groq
  text: string
  categories: Array<{ name: string; kind: 'spend' | 'income' }>
  defaultCurrency: string
}

export async function parseBudget({ client, text, categories, defaultCurrency }: Args): Promise<BudgetAgentResponse> {
  const spendNames = categories.filter(c => c.kind === 'spend').map(c => c.name)
  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-120b',
      system: buildBudgetAgentSystemPrompt(spendNames, defaultCurrency),
      user: text,
      temperature: 0,
      maxTokens: 128,
    }),
    { attempts: 3, baseMs: 500 },
  )
  const parsed = BudgetAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`budget_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
