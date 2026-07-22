# Push Verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Send test notification" button in Settings → Notifications that calls the existing `POST /api/push/test` and shows the result.

**Architecture:** A pure `pushTestMessage` formatter + a button/fetch in the Preferences Notifications `subscribed` branch. No backend change.

**Tech Stack:** React, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-pulse-push-verify-design.md`

## Global Constraints

- No backend change: `POST /api/push/test` returns `{ ok, subscriptions, sent, pruned }` (200) or 409 `{ ok:false, subscriptions:0, sent:0, pruned:0, hint }`.
- Button only in the `pushStatus === 'subscribed'` branch. No new deps. Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED.

## File Structure

- Create: `src/lib/push-test-message.ts`, `tests/lib/push-test-message.test.ts`, `docs/superpowers/notes/2026-07-22-pulse-push-verify-qa-runbook.md`.
- Modify: `src/app/settings/preferences/page.tsx`.

---

### Task 1: pushTestMessage helper + Send-test button

**Files:** Create `src/lib/push-test-message.ts`, `tests/lib/push-test-message.test.ts`. Modify `src/app/settings/preferences/page.tsx`. Create the QA runbook.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/push-test-message.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pushTestMessage } from '@/lib/push-test-message'

describe('pushTestMessage', () => {
  it('one device (singular)', () => {
    expect(pushTestMessage({ ok: true, subscriptions: 1, sent: 1, pruned: 0 }))
      .toBe('Sent to 1 device — you should see a 🔔 shortly.')
  })
  it('multiple devices + pruned suffix', () => {
    expect(pushTestMessage({ ok: true, subscriptions: 3, sent: 2, pruned: 1 }))
      .toBe('Sent to 2 devices — you should see a 🔔 shortly. 1 stale removed.')
  })
  it('no subscriptions → hint, else fallback', () => {
    expect(pushTestMessage({ ok: false, subscriptions: 0, sent: 0, pruned: 0, hint: 'enable first' })).toBe('enable first')
    expect(pushTestMessage({ ok: false, subscriptions: 0, sent: 0, pruned: 0 }))
      .toBe('No subscribed devices — enable notifications first.')
  })
  it('subs but none delivered → advise re-enable', () => {
    expect(pushTestMessage({ ok: false, subscriptions: 2, sent: 0, pruned: 2 })).toMatch(/re-enable/i)
  })
})
```

- [ ] **Step 2: Run (fail) → implement → run (pass)**

Create `src/lib/push-test-message.ts`:

```ts
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
```

Run: `pnpm test tests/lib/push-test-message.test.ts` → PASS.

- [ ] **Step 3: Wire the button into Preferences**

In `src/app/settings/preferences/page.tsx`:

Import:

```ts
import { pushTestMessage, type PushTestResult } from '@/lib/push-test-message'
```

State (near the other `useState`s):

```ts
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
```

Handler (near `save`):

```ts
  async function sendTest() {
    setTesting(true); setTestMsg(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const body = await res.json().catch(() => null) as PushTestResult | null
      setTestMsg(body ? pushTestMessage(body) : "Couldn't reach the server — try again.")
    } catch {
      setTestMsg("Couldn't reach the server — try again.")
    } finally {
      setTesting(false)
    }
  }
```

Replace the `subscribed` branch:

```tsx
          {pushStatus === 'subscribed' && (
            <button
              type="button"
              onClick={pushUnsubscribe}
              className="glass rounded-lg px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            >
              ✓ Notifications enabled — tap to disable
            </button>
          )}
```

with:

```tsx
          {pushStatus === 'subscribed' && (
            <>
              <button
                type="button"
                onClick={pushUnsubscribe}
                className="glass rounded-lg px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                ✓ Notifications enabled — tap to disable
              </button>
              <button
                type="button"
                onClick={sendTest}
                disabled={testing}
                className="glass rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none disabled:opacity-50"
              >
                {testing ? 'Sending…' : 'Send test notification'}
              </button>
              {testMsg && <p className="text-xs text-muted-foreground">{testMsg}</p>}
            </>
          )}
```

- [ ] **Step 4: Gate (UN-CHAINED) + QA runbook + commit**

Create `docs/superpowers/notes/2026-07-22-pulse-push-verify-qa-runbook.md`:

```markdown
# Push Verify — QA Runbook

1. Settings → Notifications must show "✓ Notifications enabled" (subscribe first if not).
2. Tap "Send test notification" → within a few seconds a "Pulse test 🔔" notification appears on the device; the inline text reads "Sent to N device(s)…".
3. Tapping the notification opens /app.
4. If it says "No subscribed devices" while enabled, or "Couldn't deliver…", the subscription is stale — disable + re-enable, then retest.
5. This proves the same delivery path the weekly digest / due-task / budget alerts use.
```

`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then:

```bash
git add src/lib/push-test-message.ts tests/lib/push-test-message.test.ts src/app/settings/preferences/page.tsx docs/superpowers/notes/2026-07-22-pulse-push-verify-qa-runbook.md
git commit -m "feat(push): Send test notification button + result in Settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
