# Push Verify — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review → implementation plan
**Feature:** A "Send test notification" button in Settings → Notifications that exercises the existing `POST /api/push/test` endpoint and shows the result, so the user can prove Web Push delivers end-to-end (now that the service worker registers).

## Problem

Web Push never worked in prod until this session (the SW wasn't registering — fixed). The user has no way to confirm delivery works, and the digest/due-task/budget alerts only fire on cron ticks — hard to verify on demand. The `POST /api/push/test` endpoint already sends a self-targeted test push but is not surfaced in the UI.

## Goal

Surface the test endpoint as a button + readable result. Proving the test push arrives proves the whole delivery path (VAPID sign → push service → SW wake → pull-on-push → notification display) — the same path all three cron alert types use.

## Global Constraints

- No backend change — `POST /api/push/test` exists and returns `{ ok: boolean; subscriptions: number; sent: number; pruned: number }` on 200, or 409 `{ ok: false, subscriptions: 0, sent: 0, pruned: 0, hint: string }` when the user has no subscriptions.
- UI lives in the existing Settings → Preferences Notifications section; only shown when `pushStatus === 'subscribed'`.
- No new dependencies. Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Terse. Gate UN-CHAINED before finishing.

## Architecture

### A. Pure message helper — `src/lib/push-test-message.ts`
- `type PushTestResult = { ok: boolean; subscriptions: number; sent: number; pruned: number; hint?: string }`.
- `pushTestMessage(res: PushTestResult): string` — maps the endpoint response to a display string:
  - `subscriptions === 0` (or hint present) → the hint, or "No subscribed devices — enable notifications first."
  - `sent > 0` → `Sent to ${sent} device${sent === 1 ? '' : 's'} — you should see a 🔔 shortly.` (+ ` ${pruned} stale removed.` when `pruned > 0`).
  - `sent === 0` (subscriptions > 0, none delivered) → "Couldn't deliver to any device — the subscription may be expired; disable + re-enable notifications."
- Pure → unit-tested.

### B. UI — Settings → Preferences Notifications section
- When `pushStatus === 'subscribed'`, below the "✓ Notifications enabled — tap to disable" control, add a **"Send test notification"** button.
- Local state: `testing` (in-flight) + `testMsg: string | null`.
- On click: `setTesting(true)`; `fetch('/api/push/test', { method: 'POST' })`; parse JSON (guard non-JSON); `setTestMsg(pushTestMessage(body))`; on network error → a generic "Couldn't reach the server — try again."; `finally setTesting(false)`. Button disabled while `testing`.
- Render `testMsg` inline (small text) under the button.

### Data Flow

```
tap "Send test notification"
  → POST /api/push/test (session cookie)
  → server seeds a push_notifications row + sendPushToUser (VAPID → push service)
  → device SW wakes, pulls /api/push/pending, shows "Pulse test 🔔"
  → response { ok, subscriptions, sent, pruned } → pushTestMessage → inline text
```

### Error Handling

- 409 / subscriptions 0 → the hint (enable notifications first).
- sent 0 with subs > 0 → advise re-enable (likely an expired subscription; the endpoint prunes those).
- Non-OK / non-JSON / network error → generic retry message; never throw to the user.

### Testing

- `tests/lib/push-test-message.test.ts` (pure): each branch — sent>0 (singular/plural + pruned suffix), subscriptions 0 (hint + fallback), sent 0 with subs.
- Button wiring verified via QA runbook (no component render harness; the endpoint itself already has `tests/api/push-test-route.test.ts`).

## Out of Scope (v1)

- A test affordance outside Settings (app screen).
- A device/subscription health panel (last alert sent, per-device list).
- Triggering the actual digest/budget/due-task crons from the UI (the test push proves the same delivery path).
