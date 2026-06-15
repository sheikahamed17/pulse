import { z } from 'zod'

const EnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be ≥ 32 chars'),
  BETTER_AUTH_URL: z.string().url(),
  GROQ_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return result.data
}

let cached: Env | undefined
function getEnv(): Env {
  if (cached) return cached
  cached = parseEnv(process.env)
  return cached
}

// Lazy Proxy — first access triggers validation; module load never does.
// This keeps the existing `env.SOMETHING` call sites unchanged while deferring
// the throw to runtime (where env vars actually exist in the Worker).
export const env: Env = new Proxy({} as Env, {
  get(_, key) {
    return getEnv()[key as keyof Env]
  },
  has(_, key) {
    return key in getEnv()
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv())
  },
  getOwnPropertyDescriptor(_, key) {
    const obj = getEnv()
    if (key in obj) {
      return { enumerable: true, configurable: true, value: obj[key as keyof Env] }
    }
    return undefined
  },
})
