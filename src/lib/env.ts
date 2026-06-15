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
function loadEnv(): Env {
  if (cached) return cached
  cached = parseEnv(process.env)
  return cached
}

// Lazy getters. Module load does NOT trigger validation; only direct property
// reads do. Object.keys/Object.entries on objects with getters return the
// property names WITHOUT invoking the accessors, so build-time module
// inspection (Next.js/Turbopack collecting page data) is safe. At runtime in
// the Worker request handler, env vars are present and the getters succeed.
export const env: Env = {
  get BETTER_AUTH_SECRET() { return loadEnv().BETTER_AUTH_SECRET },
  get BETTER_AUTH_URL() { return loadEnv().BETTER_AUTH_URL },
  get GROQ_API_KEY() { return loadEnv().GROQ_API_KEY },
  get NODE_ENV() { return loadEnv().NODE_ENV },
} as Env
