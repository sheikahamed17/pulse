export type PushTestResult = { ok: boolean; subscriptions: number; sent: number; pruned: number; hint?: string }

/** Map the /api/push/test response to a user-facing status line. */
export function pushTestMessage(res: PushTestResult): string {
  if (res.subscriptions === 0) return res.hint ?? 'No subscribed devices — enable notifications first.'
  if (res.sent > 0) {
    const base = `Sent to ${res.sent} device${res.sent === 1 ? '' : 's'} — you should see a 🔔 shortly.`
    return res.pruned > 0 ? `${base} ${res.pruned} stale removed.` : base
  }
  return "Couldn't deliver to any device — the subscription may be expired; disable + re-enable notifications."
}
