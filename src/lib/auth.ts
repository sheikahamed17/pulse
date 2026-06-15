import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createDb } from '@/lib/db'
import type { D1Database } from '@cloudflare/workers-types'

// Auth secrets live in the Workers runtime env (set via `wrangler secret put`
// or wrangler.toml [vars]), NOT in Node's process.env. Dashboard-set Secrets
// only populate the Workers env, so we read from getCloudflareContext().env
// directly instead of going through @/lib/env (which reads process.env and
// is only correct for Node-runtime tests).
type AuthEnv = {
  DB: D1Database
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
}

function buildAuth() {
  const cfEnv = getCloudflareContext().env as CloudflareEnv & AuthEnv
  if (!cfEnv.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not set in the Workers runtime env. Run `wrangler secret put BETTER_AUTH_SECRET`.')
  }
  if (!cfEnv.BETTER_AUTH_URL) {
    throw new Error('BETTER_AUTH_URL is not set in the Workers runtime env. Run `wrangler secret put BETTER_AUTH_URL` (or add to wrangler.toml [vars]).')
  }

  const db = createDb(cfEnv.DB)

  return betterAuth({
    secret: cfEnv.BETTER_AUTH_SECRET,
    baseURL: cfEnv.BETTER_AUTH_URL,
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
