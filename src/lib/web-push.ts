import { importJWK, SignJWT, type JWK } from 'jose'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'

export type VapidEnv = {
  VAPID_PRIVATE_KEY?: string
  VAPID_PUBLIC_KEY?: string
}

/**
 * Build a VAPID Authorization header for Web Push
 * Uses ES256 (ECDSA P-256) JWT with subject, audience, and expiration claims.
 */
export async function buildVapidAuthHeader(endpoint: string, env: VapidEnv): Promise<string> {
  const privateKeyJson = env.VAPID_PRIVATE_KEY
  const publicKey = env.VAPID_PUBLIC_KEY

  if (!privateKeyJson || !publicKey) {
    throw new Error('VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY are required')
  }

  try {
    const privateKeyObj = JSON.parse(privateKeyJson) as JWK
    const privateKey = await importJWK(privateKeyObj, 'ES256')

    const url = new URL(endpoint)
    const now = Math.floor(Date.now() / 1000)
    const exp = now + 12 * 3600 // 12-hour expiration

    const jwt = await new SignJWT({})
      .setSubject('mailto:sdsheikahamed@gmail.com')
      .setAudience(url.origin)
      .setExpirationTime(exp)
      .setProtectedHeader({ alg: 'ES256' })
      .sign(privateKey)

    return `vapid t=${jwt}, k=${publicKey}`
  } catch (err) {
    throw new Error(`Failed to build VAPID header: ${(err as Error).message}`)
  }
}

/**
 * Send a wake-up push notification to a single subscription endpoint.
 * Returns 'ok' on success, 'gone' if the endpoint is permanently invalid (404/410),
 * or 'failed' on other errors.
 */
export async function sendWakeUpPush(
  sub: { endpoint: string },
  env: VapidEnv,
): Promise<'ok' | 'gone' | 'failed'> {
  try {
    const header = await buildVapidAuthHeader(sub.endpoint, env)

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: header,
        ttl: '86400',
      },
      body: '', // Empty body — pull-on-push pattern
    })

    if (res.ok) return 'ok'
    if (res.status === 404 || res.status === 410) return 'gone'
    return 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Send push notifications to all active subscriptions for a user.
 * Deletes subscriptions that return 'gone' (404/410).
 * Increments failed_count and deletes after 5 consecutive failures.
 * Resets failed_count to 0 on success.
 */
export async function sendPushToUser(
  db: Kysely<DB>,
  env: VapidEnv,
  userId: string,
): Promise<{ sent: number; pruned: number }> {
  const subs = await db
    .selectFrom('push_subscriptions')
    .where('user_id', '=', userId)
    .selectAll()
    .execute()

  let sent = 0
  let pruned = 0

  for (const sub of subs) {
    const result = await sendWakeUpPush({ endpoint: sub.endpoint }, env)

    if (result === 'gone') {
      // Endpoint is no longer valid; delete it
      await db
        .deleteFrom('push_subscriptions')
        .where('id', '=', sub.id)
        .execute()
      pruned++
    } else if (result === 'failed') {
      // Increment failed count; delete if >= 5
      const nextCount = sub.failed_count + 1
      if (nextCount >= 5) {
        await db
          .deleteFrom('push_subscriptions')
          .where('id', '=', sub.id)
          .execute()
        pruned++
      } else {
        await db
          .updateTable('push_subscriptions')
          .set({ failed_count: nextCount })
          .where('id', '=', sub.id)
          .execute()
      }
    } else {
      // Success: reset failed_count to 0
      await db
        .updateTable('push_subscriptions')
        .set({ failed_count: 0 })
        .where('id', '=', sub.id)
        .execute()
      sent++
    }
  }

  return { sent, pruned }
}
