export type AssistantTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  intent?: string | null
  payload?: unknown
  /**
   * Session-only: true when this answer's question was asked BY VOICE this
   * session (→ speak the answer aloud). NOT persisted — `parseThread` drops it,
   * so a reloaded voice answer never re-speaks on load.
   */
  viaVoice?: boolean
}

/**
 * Extract the most recent up-to-maxUserMsgs user message texts from a conversation history,
 * in chronological order (oldest of the kept window first).
 *
 * Returns only user texts (role==='user'), trimmed, with empty/whitespace-only texts dropped.
 * No mutation of input.
 *
 * This is the only conversation context sent to the server for multi-turn support.
 */
export function buildAgentHistory(turns: AssistantTurn[], maxUserMsgs = 4): string[] {
  // Filter only user turns
  const userTurns = turns.filter(turn => turn.role === 'user')

  // Get the most recent maxUserMsgs user messages (chronological order preserved)
  const recentUserTurns = userTurns.slice(Math.max(0, userTurns.length - maxUserMsgs))

  // Map to trimmed texts, dropping empty/whitespace-only ones
  return recentUserTurns.map(turn => turn.text.trim()).filter(text => text.length > 0)
}
