import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { NOTE_SYSTEM_PROMPT } from './prompts/note'
import { NoteAgentResponseSchema, type NoteAgentResponse } from './schemas/note-agent-response'

type Args = {
  client: Groq
  text: string
}

export async function parseNote({
  client, text,
}: Args): Promise<NoteAgentResponse> {
  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-120b',
      system: NOTE_SYSTEM_PROMPT,
      user: text,
      temperature: 0,
      maxTokens: 256,
    }),
    { attempts: 3, baseMs: 500 },
  )

  const parsed = NoteAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`note_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
