import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { env as envVars } from '@/lib/env'
import { createDb } from '@/lib/db'
import type { D1Database } from '@cloudflare/workers-types'

async function buildAuth() {
  const cfContext = await getCloudflareContext({ async: true })
  const cfEnv = cfContext.env as CloudflareEnv & { DB: D1Database }
  const db = createDb(cfEnv.DB)

  return betterAuth({
    secret: envVars.BETTER_AUTH_SECRET,
    baseURL: envVars.BETTER_AUTH_URL,
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
  const auth = await buildAuth()
  return auth.handler(req)
}

export async function getSession(req: Request) {
  const auth = await buildAuth()
  return auth.api.getSession({ headers: req.headers })
}
