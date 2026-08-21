import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { SmsAgentResponse } from '@/lib/agents/schemas/sms-agent-response'

/** SMS agent output → a money payload, or null if it's not a usable transaction. */
export function smsToMoneyPayload(
  r: SmsAgentResponse,
  primaryCurrency: string,
  nowIso: string,
  text: string,
  source: MoneyPayload['source'] = 'sms',
): MoneyPayload | null {
  if (!r.is_transaction || r.amount == null) return null
  return {
    amount: r.amount,
    currency: (r.currency ?? primaryCurrency) as MoneyPayload['currency'],
    direction: r.direction ?? 'out',
    category_id: null,
    description: null,
    merchant: r.merchant ?? null,
    tags: [],
    occurred_at: nowIso,
    source,
    raw_input: text,
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Deterministic per (userId, SMS text) → idempotent re-POSTs of the same SMS. */
export async function smsDedupHash(userId: string, text: string): Promise<string> {
  return sha256Hex(`${userId}\n${text}`)
}
export async function smsEntityId(userId: string, text: string): Promise<string> {
  return `sms-${await smsDedupHash(userId, text)}`
}
export async function smsOpId(userId: string, text: string): Promise<string> {
  return `smsop-${await smsDedupHash(userId, text)}`
}
