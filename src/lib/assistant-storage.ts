import type { AssistantTurn } from '@/lib/assistant'

/**
 * Local-only persistence for the /assistant chat thread. The thread is ephemeral
 * conversation state (not user data worth syncing across devices), so it lives in
 * localStorage per-user — NOT in the op-log. Corrupt/oversized data degrades to an
 * empty thread rather than throwing.
 */

export const THREAD_CAP = 50

const KEY_PREFIX = 'pulse-assistant-thread-'

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** Keep only the most recent `cap` turns (chronological order preserved). Pure. */
export function capThread(turns: AssistantTurn[], cap = THREAD_CAP): AssistantTurn[] {
  if (turns.length <= cap) return turns.slice()
  return turns.slice(turns.length - cap)
}

/** Serialize a (capped) thread to a JSON string. Pure. */
export function serializeThread(turns: AssistantTurn[], cap = THREAD_CAP): string {
  return JSON.stringify(capThread(turns, cap))
}

/**
 * Parse a stored thread string into valid turns. Returns [] for null / invalid JSON
 * / non-array, and drops any element that isn't a well-formed turn (guards against
 * corrupt or hand-edited localStorage). Pure.
 */
export function parseThread(raw: string | null | undefined): AssistantTurn[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: AssistantTurn[] = []
  for (const item of data) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { text?: unknown }).text === 'string' &&
      ((item as { role?: unknown }).role === 'user' || (item as { role?: unknown }).role === 'assistant')
    ) {
      const t = item as { id: string; role: 'user' | 'assistant'; text: string; intent?: unknown; payload?: unknown }
      out.push({
        id: t.id,
        role: t.role,
        text: t.text,
        intent: typeof t.intent === 'string' || t.intent === null ? (t.intent as string | null) : undefined,
        payload: t.payload,
      })
    }
  }
  return out
}

/** Load the persisted thread for a user (localStorage). Safe on the server / when storage is unavailable. */
export function loadThread(userId: string): AssistantTurn[] {
  if (typeof window === 'undefined' || !userId) return []
  try {
    return parseThread(window.localStorage.getItem(keyFor(userId)))
  } catch {
    return []
  }
}

/** Persist the (capped) thread for a user (localStorage). No-op on the server / when storage is unavailable. */
export function saveThread(userId: string, turns: AssistantTurn[]): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(keyFor(userId), serializeThread(turns))
  } catch {
    // storage full / disabled — a persisted thread is best-effort, never fatal
  }
}
