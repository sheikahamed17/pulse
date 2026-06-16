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
    // Better Auth defaults to camelCase column names (expiresAt, userId, etc.)
    // but our schema in migrations/0001_initial.sql uses snake_case to match
    // the sync engine tables (op_log, widgets, devices). Map Better Auth's
    // logical field names to our snake_case columns so the adapter generates
    // SQL that matches the actual DB shape.
    user: {
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    account: {
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
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
