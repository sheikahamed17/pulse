import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import { createDb } from '@/lib/db'
import type { D1Database } from '@cloudflare/workers-types'

// Auth secrets live in the Workers runtime env (set via `wrangler secret put`
// or wrangler.toml [vars]), NOT in Node's process.env. Dashboard-set Secrets
// only populate the Workers env, so we read from getCloudflareContext().env
// directly instead of going through @/lib/env (which reads process.env and
// is only correct for Node-runtime tests).
//
// Validation mirrors the schema in src/lib/env.ts so the two runtimes
// enforce the same invariants (length floor for the secret, URL shape).
const AuthEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be ≥ 32 chars'),
  BETTER_AUTH_URL: z.string().url(),
})

type AuthEnvBindings = {
  DB: D1Database
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
}

function buildAuth() {
  const cfEnv = getCloudflareContext().env as CloudflareEnv & AuthEnvBindings

  const parsed = AuthEnvSchema.safeParse({
    BETTER_AUTH_SECRET: cfEnv.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: cfEnv.BETTER_AUTH_URL,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Invalid Workers env for auth:\n${issues}\n\nFix by running locally:\n  pnpm exec wrangler secret put BETTER_AUTH_SECRET\n  pnpm exec wrangler secret put BETTER_AUTH_URL`,
    )
  }

  const db = createDb(cfEnv.DB)

  return betterAuth({
    secret: parsed.data.BETTER_AUTH_SECRET,
    baseURL: parsed.data.BETTER_AUTH_URL,
    database: kyselyAdapter(db, { type: 'sqlite' }),
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          console.log(`[magic-link] for ${email}: ${url}`)
        },
      }),
    ],
  } satisfies BetterAuthOptions)
}

// Per-request handler — Cloudflare context not available at module load
export async function handler(req: Request) {
  const auth = buildAuth()
  return auth.handler(req)
}

export async function getSession(req: Request) {
  const auth = buildAuth()
  return auth.api.getSession({ headers: req.headers })
}
