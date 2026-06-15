import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = getCloudflareContext()
    const env = ctx.env as Record<string, unknown> & { DB?: D1Database }
    const out = {
      ok: true,
      hasContext: !!ctx,
      hasEnv: !!env,
      env_keys: env ? Object.keys(env).sort() : [],
      hasDB: typeof env?.DB === 'object',
      auth_url_present: typeof env?.BETTER_AUTH_URL === 'string' && env.BETTER_AUTH_URL.length > 0,
      auth_url_value: typeof env?.BETTER_AUTH_URL === 'string'
        ? env.BETTER_AUTH_URL
        : null,
      auth_secret_present: typeof env?.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length > 0,
      groq_key_present: typeof env?.GROQ_API_KEY === 'string' && env.GROQ_API_KEY.length > 0,
      node_env: env?.NODE_ENV ?? null,
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n\nStack:\n${err.stack}` : String(err)
    return new Response('DEBUG ERROR:\n\n' + msg, {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    })
  }
}
