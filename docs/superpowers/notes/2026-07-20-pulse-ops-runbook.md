# Pulse — Ops Runbook (manual, owner-only steps)

Two deferred items need an **authenticated session** (backfill) or a **real device**
(push), so they can't be automated from CI or an agent. Run them yourself against
prod: <https://pulse.sdsheikahamed.workers.dev>.

---

## 1. One-time op-log backfill

**What it does:** `POST /api/admin/backfill` replays your entire `op_log` into the
server-side D1 materialized tables in HLC order (via `materializeRow`, so
category/recurring rows land before dependent money/task rows). **Idempotent** —
safe to run more than once. Needed because prod silently ran Phase 1 for a while,
so the server tables may be missing rows that only exist in your client op-log.

**Auth:** session cookie (no CRON_SECRET) — so run it *from a logged-in browser*, not curl.

**Steps:**
1. Open <https://pulse.sdsheikahamed.workers.dev/app> and sign in (passkey / PIN).
2. Open DevTools → Console and run:
   ```js
   fetch('/api/admin/backfill', { method: 'POST' })
     .then(r => r.json())
     .then(console.log)
   ```
3. Expect: `{ ok: true, total_ops: <n>, materialized: <n>, by_kind: {…}, errors: [] }`.
   - `errors: []` and `materialized` ≈ `total_ops` → success.
   - Non-empty `errors` → capture them; re-running is safe (idempotent).

---

## 2. End-to-end push verification (iPhone)

**What it proves:** the full pipeline — VAPID signing → push service → device wake
→ service-worker pull → visible notification. There is no automated path (crons are
CRON_SECRET-gated), so a new self-test endpoint (`POST /api/push/test`) exists to
trigger a self-targeted push.

**Pull-on-push:** the wake-up push carries no payload; the endpoint seeds a
"Pulse test 🔔" row in `push_notifications` for the service worker to fetch and
display when the device wakes.

**Steps (on the iPhone, in the installed PWA):**
1. Open the app, sign in, and **enable notifications** when prompted (or via the
   in-app settings). This registers a `push_subscription` for the device.
2. In desktop Safari/Chrome with the same account logged in (or via the device's
   remote console), run:
   ```js
   fetch('/api/push/test', { method: 'POST' })
     .then(r => r.json())
     .then(console.log)
   ```
3. Expect `{ ok: true, subscriptions: >=1, sent: >=1, pruned: 0 }` **and** a
   "Pulse test 🔔" notification on the iPhone (tapping it opens `/app`).
   - `{ ok: false, subscriptions: 0, hint: "…enable notifications…" }` → the device
     isn't subscribed yet; complete step 1 first.
   - `sent: 0, pruned: >=1` → the stored subscription was stale/invalid and was
     pruned; re-subscribe (toggle notifications off/on) and retry.

> The test inserts one real notification row (title "Pulse test 🔔"). It's harmless —
> dismiss it after confirming.
