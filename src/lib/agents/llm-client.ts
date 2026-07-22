import Groq from 'groq-sdk'

export type GroqModel =
  // 2026-07-07: migrated off the decommissioned llama-3.1-* line. Groq
  // recommends gpt-oss as the replacement; json_object response_format (used by
  // callGroqJSON) is supported. Vision model lives in receipt-agent.ts.
  | 'openai/gpt-oss-20b'
  | 'openai/gpt-oss-120b'
  | 'whisper-large-v3-turbo'

export function makeGroqClient(apiKey: string): Groq {
  return new Groq({ apiKey })
}

type CallArgs = {
  client: Groq
  model: GroqModel
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}

// gpt-oss are reasoning models: they emit reasoning tokens BEFORE the JSON, and
// those count against max_tokens. The per-agent maxTokens size the JSON OUTPUT
// (carried over from the non-reasoning llama era), so we add a fixed reasoning
// allowance on top — otherwise a small cap (the router's 64) is exhausted mid-
// reasoning and Groq returns 400 json_validate_failed "max completion tokens
// reached before generating a valid document". max_tokens is a ceiling (unused
// tokens are free — the model stops at the JSON's end), so generous headroom is safe.
const REASONING_HEADROOM = 2048

export async function callGroqJSON<T = unknown>(args: CallArgs): Promise<T> {
  const completion = await args.client.chat.completions.create({
    model: args.model,
    response_format: { type: 'json_object' },
    reasoning_effort: 'low', // short reasoning — these are simple structured extractions
    temperature: args.temperature ?? 0,
    max_tokens: (args.maxTokens ?? 256) + REASONING_HEADROOM,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
  })

  const choice = completion.choices?.[0]
  if (!choice) throw new Error('groq: no choice returned')
  const text = choice.message?.content
  if (!text) throw new Error('groq: empty content')

  try { return JSON.parse(text) as T }
  catch (err) { throw new Error(`groq: failed to parse JSON response — ${(err as Error).message}\nRaw: ${text}`) }
}

type RetryArgs = { attempts: number; baseMs: number }

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryArgs): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < opts.attempts; i++) {
    try { return await fn() }
    catch (err) {
      lastErr = err
      const status = (err as { status?: number }).status
      if (status !== undefined && !RETRYABLE_STATUS.has(status)) throw err
      if (i === opts.attempts - 1) break
      const delay = opts.baseMs * Math.pow(3, i)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}
