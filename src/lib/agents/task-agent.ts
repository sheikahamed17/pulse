import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildTaskAgentSystemPrompt } from './prompts/task-agent'
import { TaskAgentResponseSchema, type TaskAgentResponse } from './schemas/task-agent-response'

type Args = {
  client: Groq
  text: string
  nowIso?: string
  userTz?: string
}

export async function parseTaskEntry({
  client, text, nowIso, userTz,
}: Args): Promise<TaskAgentResponse> {
  const system = buildTaskAgentSystemPrompt({
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

  const parsed = TaskAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`task_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
