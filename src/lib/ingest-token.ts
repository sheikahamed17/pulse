const PREFIX = 'pulse_sms_'

/** Build a personal ingest token `pulse_sms_{userId}_{secret}` + its raw secret. */
export function makeIngestToken(userId: string): { token: string; secret: string } {
  const secret = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  return { token: `${PREFIX}${userId}_${secret}`, secret }
}

/**
 * Parse `pulse_sms_{userId}_{secret}`. The userId may contain underscores, so we
 * strip the prefix, then split on the LAST underscore (the secret has none).
 */
export function parseIngestToken(token: string): { userId: string; secret: string } | null {
  if (!token.startsWith(PREFIX)) return null
  const rest = token.slice(PREFIX.length)
  const i = rest.lastIndexOf('_')
  if (i <= 0 || i === rest.length - 1) return null
  const userId = rest.slice(0, i)
  const secret = rest.slice(i + 1)
  if (!userId || !secret) return null
  return { userId, secret }
}

/** Hex SHA-256 of a secret (Web Crypto — available in Workers + Node test env). */
export async function hashSecret(secret: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
