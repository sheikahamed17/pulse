import Groq from 'groq-sdk'

export type GroqModel =
  | 'llama-3.1-8b-instant'
  | 'llama-3.1-70b-versatile'
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

export async function callGroqJSON<T = unknown>(args: CallArgs): Promise<T> {
  const completion = await args.client.chat.completions.create({
    model: args.model,
    response_format: { type: 'json_object' },
    temperature: args.temperature ?? 0,
    max_tokens: args.maxTokens ?? 512,
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
