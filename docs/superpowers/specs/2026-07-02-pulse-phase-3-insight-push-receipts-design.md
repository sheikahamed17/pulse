# Pulse Phase 3 — Insight digest + Web Push + Receipt vision

**Date:** 2026-07-02
**Status:** Approved by Sheik (brainstorm 2026-07-02); awaiting implementation plan
**Baseline:** `main` at `v2.0-phase-2` (merge `7aba249`), 308 tests

## TL;DR

Phase 3 ships the master plan's intelligence trio on top of the Phase 0-2 spine:

1. **Cron dispatch shim (sub-phase 3.0, P0)** — fixes a live production bug: `wrangler.toml` declares crons but no `scheduled()` handler exists, so the Phase 1 recurring cron and Phase 2 FX cron currently fire into nothing. A custom worker entry wraps the OpenNext handler and dispatches cron fires in-process to `/api/cron/*` routes with bearer auth.
2. **Insight agent** — a Monday-morning cron aggregates each user's prior week (spend by category, income, task throughput), has Llama 3.1 70B write a 3-4 sentence narrative over the **aggregates only**, and emits a `weekly` insight as an **op-log entity** (`device_id='cron'`, the pattern proven by `/api/cron/recur`). Insights sync to a new Dexie v4 `insights` store and render as a dismissable digest card atop the Money tab — readable offline.
3. **Web Push** — payload-free "pull-on-push": crons insert `push_notifications` rows and send empty VAPID pushes as wake-ups; the service worker fetches `/api/push/pending` (session-cookie auth) and shows notifications. Triggers: due-task sweep every 15 min + Monday digest. Subscriptions are **server-only** rows (device-specific credentials, never synced).
4. **Receipt vision** — camera button beside the mic → R2 upload → Groq Llama 4 Scout vision parse → the existing ConfirmationChipMoney with a thumbnail. Vision output is clamped through MoneyPayloadSchema (prompt-injection defense). Offline capture queues in a `receipt_queue` mirroring `voice_queue`.
5. **Polish carryovers** — cross-tab voice/receipt-queue race fixed via the Web Locks API; prefs a11y (`aria-selected`) + visible save errors; schema↔`*_FIELDS` consistency tests.

Scope decisions (all Sheik-approved): weekly digest only (no on-demand Q&A — that is query_money v2, deferred); digest surfaces as card + push (no new tab); push triggers are due-tasks + digest (no overdue nag); receipts keep the original photo in R2 linked to the entry.

## Context

- Phase 2 (`v2.0-phase-2`) shipped Tasks, TabBar, user_prefs (tz + primary currency), multi-currency FX via ECB cron, voice SSE, and the query_money agent. 308 tests.
- **Production bug found during Phase 3 recon:** the OpenNext-compiled worker (`.open-next/worker.js`, `wrangler.toml main`) exposes `fetch` only. Cron triggers fire `scheduled` events that nothing handles. Phase 1's T23 documented a "shim Worker fallback" that was never built. Consequence: recurring rules have not materialized and FX rates have not updated in production since Phase 1 ship. Recovery is inherent: `next_due_at` is persisted so recurring entries backfill on the first successful fire; FX just fetches the latest feed.
- `'insight'` is already in `ENTITY_KINDS` (declared Phase 1); `getPayloadSchemaForKind('insight')` returns null and no materialization exists — the entity needs end-to-end wiring but no union changes.
- Server-generated ops are proven: `/api/cron/recur` creates ops with `device_id='cron'`, deterministic `serverHlcFor()`, and idempotency keys (`recur-{rule_id}-{next_due_at}`).
- JOSE is already in the dependency tree (transitive via better-auth); Phase 3 promotes it to a direct dependency for VAPID JWT signing. No other new npm dependencies.
- iOS 16.4+ supports Web Push for home-screen-installed PWAs (Sheik's usage). Constraints honored: permission requested from a user gesture; every push shows a visible notification.

## Non-goals (deferred)

- On-demand analytical Q&A (query_money v2: by-category / delta / list) — Phase 4 backlog
- query_task agent; recurring tasks; task tags/projects/sub-tasks
- Overdue-nag re-notification (needs snooze UX)
- Learning + Notes domains
- Multi-primary currency; manual FX override UI
- RFC 8291 push payload encryption (pull-on-push makes it unnecessary)
- Digest history UI beyond "latest card" (rows accumulate in `insights`; a history view is trivial later)
- Receipt vision CI eval script (manual 10-receipt eval by Sheik instead; image fixtures too heavy for CI)

## Architecture

```
worker.ts (NEW custom entry)
├── fetch    → OpenNext handler (unchanged passthrough)
└── scheduled(event, env, ctx)
      map event.cron → path, then IN-PROCESS handler.fetch(
        new Request(origin + path, { method: 'POST',
          headers: { authorization: `Bearer ${env.CRON_SECRET}` } }), env, ctx)
      ├── "0 2 * * *"    → /api/cron/recur       (Phase 1, existing)
      ├── "0 3 * * *"    → /api/cron/fx          (Phase 2, existing)
      ├── "*/15 * * * *" → /api/cron/due-tasks   (NEW)
      ├── "30 2 * * 1"   → /api/cron/digest      (NEW; 02:30 UTC Mon = 08:00 IST Mon)
      └── "30 14 * * 1"  → /api/cron/digest      (NEW; covers Americas' Monday morning)
      unknown pattern → console.error + no-op
```

Two Monday digest fires because a single 02:30 UTC fire is Sunday evening local for
timezones west of ~UTC+2 — their week hasn't ended. The digest route only processes
users whose local weekday (per user_prefs.tz) is Monday at fire time; the idempotency
key guarantees exactly one digest per user per week regardless of how many fires see them.

**Insight flow:** digest cron → D1 aggregation (per user, week bounds in `user_prefs.tz`, Monday start) → 70B narrative → insight op → op_log → LWW materialize to D1 `insights` → device sync → Dexie v4 `insights` → DigestCard reads locally.

**Push flow:** cron inserts `push_notifications` row (idempotent PK) → sends payload-free VAPID push per subscription → SW `push` handler fetches `/api/push/pending` with session cookies → `showNotification` per row → route marks rows delivered. `notificationclick` focuses/opens the app at the row's `url`.

**Receipt flow:** camera button → blob → `callReceiptApiStreaming` → `/api/receipt` SSE (`uploading` → `parsing` → `payload`) → server: R2 put `{userId}/{uuid}.jpg` → vision extract → Zod-clamped money draft with `receipt_key` + `source: 'receipt'` → ConfirmationChipMoney with thumbnail → confirm creates the money op as usual. Offline: blob into `receipt_queue`, drained on `online` under a Web Lock.

## Data model — migration `0004_phase_3_insight_push_receipts.sql`

```sql
-- Insights (op-log entity, LWW-materialized like tasks)
CREATE TABLE insights (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  period      TEXT NOT NULL CHECK (period IN ('weekly')),
  starts_at   TEXT NOT NULL,          -- ISO, inclusive week start (user-tz Monday as UTC)
  ends_at     TEXT NOT NULL,          -- ISO, exclusive
  summary     TEXT NOT NULL,          -- LLM narrative, <=2000 chars
  metrics     TEXT NOT NULL,          -- JSON: totals, top categories, task counts, skipped_currencies
  field_hlcs  TEXT NOT NULL,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_insights_user_start ON insights (user_id, starts_at DESC);

-- Push subscriptions (SERVER-ONLY, like user_prefs; never in the op-log)
CREATE TABLE push_subscriptions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_push_subs_user ON push_subscriptions (user_id);

-- Notification outbox (id doubles as the idempotency key)
CREATE TABLE push_notifications (
  id         TEXT PRIMARY KEY,        -- e.g. 'due-{task_id}-{due_at}', 'digest-{userId}-{weekStart}'
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT NOT NULL DEFAULT '/app',
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX idx_push_notif_user_unread ON push_notifications (user_id) WHERE read_at IS NULL;

-- Receipt link on money entries
ALTER TABLE money_entries ADD COLUMN receipt_key TEXT;
```

**Client (Dexie v4):** adds `insights: 'id, user_id, [user_id+starts_at]'` and `receipt_queue: 'id, status, created_at'` (mirrors `voice_queue`). Additive bump; v1-v3 untouched.

**Types:** `InsightTable`/`InsightRow` (+ DB union), `InsightPayloadSchema` (`period` enum `['weekly']`, `starts_at`/`ends_at` datetime with from<to refine, `summary` 1-2000, `metrics` as a **JSON-encoded string** — the LWW materializer writes payload fields verbatim into D1 columns, so objects can't ride the pipe; the client `JSON.parse`s for display), `INSIGHT_FIELDS = ['period','starts_at','ends_at','summary','metrics']`, dispatcher case, `applyLocalOp` case + `db.insights` in the transaction store list, `materializeRow` case via the shared LWW helper. Money payload gains `receipt_key: z.string().min(1).nullable().optional()`; `MoneyEntryRow`/`MoneyEntryTable` gain `receipt_key: string | null`; `MONEY_FIELDS` appends `'receipt_key'`; money `source` enum gains `'receipt'` (plan verifies any D1 CHECK constraint on money_entries.source before altering — if a CHECK exists, migration 0004 rebuilds or drops/re-adds it).

**Consistency guard (new test):** for every entity kind with a payload schema, assert schema keys ⊆ the route's `*_FIELDS` const (money/recurring/category/task/insight). These lists are hand-synced today; divergence silently drops fields during LWW merge.

## Sub-system design

### 3.0 Cron dispatch shim

- `worker.ts` at repo root (or `src/worker.ts` per OpenNext custom-entry convention — plan pins the exact path after checking `@opennextjs/cloudflare` docs): `import handler from './.open-next/worker.js'; export default { fetch: handler.fetch, async scheduled(event, env, ctx) { ... } }`.
- Dispatch map is a literal `Record<string, string>` of the four cron patterns → route paths. In-process `handler.fetch` — no public network hop; the routes' existing `isAuthorizedCron` bearer check is the only gate, unchanged.
- `wrangler.toml`: `main` → the shim's build output; `crons` gains the two new patterns.
- CI: deploy.yml step asserts `CRON_SECRET` exists (via `wrangler secret list`), failing loudly instead of silently shipping unfireable crons.
- Verification: `wrangler dev --test-scheduled` curl of `/__scheduled?cron=...` for each pattern; post-deploy `wrangler tail` observation is a retro checklist item.
- Risk: importing the OpenNext build output from a custom entry is the sharpest edge in Phase 3. Fallback documented in the plan: a separate 5-line dispatcher Worker (own wrangler config, service-bound or plain fetch to the public URL) if the wrapped-entry route fights the build.

### 3.1-3.2 Insight digest

- `/api/cron/digest` (bearer-gated): iterate users (from `user` table); skip any user whose local weekday (per `user_prefs.tz`) is not Monday at fire time; per user compute prior-week bounds in `user_prefs.tz` (Monday 00:00 local → next Monday, converted to UTC ISO); aggregate money_entries (excluding deleted): spend total + top-5 categories by converted amount, income total — each non-primary entry through `convertToPrimary`; **entries whose currency has no rate ≤ that date are excluded from totals and their currencies recorded in `metrics.skipped_currencies`**. Task metrics: completed/created in window, overdue open count at window end.
- Narrative: 70B (`llama-3.1-70b-versatile`, temperature 0.3 for mild variety, maxTokens 512) receives **aggregates only** — never raw entries. Output = plain text ≤2000 chars, stored as `summary`. LLM failure → digest op still emitted with a deterministic fallback summary built from the metrics (the digest must not depend on LLM uptime).
- Op: id/idempotency `insight-weekly-{userId}-{weekStartISOdate}` (skip if op id exists — same guard as recur), `device_id='cron'`, `serverHlcFor(now)` (extracted to a shared util from recur's local copy), `op_type='create'`. Insert to op_log + materialize.
- Push hookup: insert `push_notifications` row `digest-{userId}-{weekStart}` ("Your week in review is ready") + wake-up push (sub-phase 3.4 wires this; digest cron ships the row-insert from day one, the push send is added when 3.3 lands).
- `DigestCard` (client): `useLiveQuery` latest `insights` row for the user; render when `starts_at` within 7 days and `sync_meta['digest-dismissed-{id}']` absent; shows narrative, metric chips (spend, income, tasks done, overdue), skipped-currency footnote when non-empty. Dismiss writes the sync_meta key (local-only, per device — acceptable).

### 3.3-3.4 Web Push

- `src/lib/web-push.ts`: `buildVapidAuthHeader(endpointOrigin, env)` — ES256 JWT via JOSE (`SignJWT`, claims `aud`=push-service origin, `sub`=mailto, `exp`=+12h), `vapid t=...,k=...` header format; `sendWakeUpPush(subscription, env)` — POST to endpoint, `TTL: 86400`, empty body. 404/410 → return `'gone'` (caller deletes row); other non-2xx → `'failed'` (caller increments `failed_count`, deletes at 5).
- `/api/push/subscribe` POST (session auth): Zod-validated `{ endpoint, keys: { p256dh, auth } }` upsert by endpoint. DELETE: remove by endpoint (unsubscribe toggle).
- `/api/push/pending` GET (session auth): unread rows for the user (≤10, oldest first), marks them `read_at=now` in the same request (D1 has no interactive transactions; a re-fetch race at worst re-shows a notification), returns `{ notifications }`.
- `/api/cron/due-tasks` (bearer-gated): tasks with `due_at ≤ now AND completed_at IS NULL AND deleted_at IS NULL` and no `push_notifications` row `due-{task_id}-{due_at}` → insert row ("Task due: {title}") + wake-up push to each of the user's subscriptions. Editing `due_at` re-arms naturally (new key). No look-back cap needed — the idempotency row permanently suppresses re-sends.
- `sw.ts` additions (before `serwist.addEventListeners()`): `push` → `event.waitUntil(fetch('/api/push/pending').then(showNotification per row))` with a generic fallback notification if the fetch fails (iOS visible-notification requirement); `notificationclick` → close + focus-or-open `notification.data.url`.
- `useUserPushSubscription` hook + prefs toggle + one-time nudge after first due-dated task confirm. Permission request strictly inside click handlers. Denied → "blocked in browser settings" state, no re-prompt.
- Secrets/vars: `VAPID_PRIVATE_KEY` (secret #3), `VAPID_PUBLIC_KEY` (plain var, also consumed client-side for `applicationServerKey`). Keys generated once by Sheik (`npx web-push generate-vapid-keys` or an equivalent one-shot script committed to `scripts/`).

### 3.5 Receipt vision

- `/api/receipt` POST (session auth, multipart `image`): size cap 8 MB (413 above), content-type allowlist (jpeg/png/webp/heic). SSE events `uploading` → `parsing` → `payload` (or `error`), cloning the `/api/voice` ReadableStream pattern. R2 put to `RECEIPTS` at `{userId}/{uuid}.{ext}` first (photo survives even if parse fails); then Groq vision (Llama 4 Scout family — exact model ID pinned at plan time from the live models endpoint) with an extraction prompt (merchant, total, currency, date; user's categories for a category guess); map to a money draft and validate through MoneyPayloadSchema + `SUPPORTED_CURRENCIES` + integer minor-units clamp. Vision text is data, never instructions — anything unparseable → `error` event; the client keeps the photo queued/linked either way.
- Payload: `{ kind: 'money', ..., source: 'receipt', receipt_key, raw_input: '<vision-extracted text summary>' }` → existing ConfirmationChipMoney; chip shows a thumbnail (object URL from the local blob — no extra fetch) above the amount.
- `/api/receipt/[key]` GET (session auth): serves the R2 object only when the key's `{userId}/` prefix matches the session user. MoneyList rows with `receipt_key` render 📎 → tap opens the image (authenticated fetch → blob URL).
- `src/lib/receipt-sse.ts` clones voice-sse (event union + `callReceiptApiStreaming`). `receipt_queue` Dexie store + drain clones voice-queue, sharing the Web Locks guard.
- `wrangler.toml`: `[[r2_buckets]] binding = "RECEIPTS", bucket_name = "pulse-receipts"`; deploy.yml creates the bucket if missing.

### 3.6 Polish

- `navigator.locks.request('pulse-voice-drain', drain)` wrapping both queue drains (replaces the in-process `isDraining` guard's cross-tab blind spot; the in-process guard stays as a fast path).
- Prefs: `aria-selected` on tz option buttons; save failure renders an inline rose-colored error line.
- Attempt `Table<FxRateRow>` typing to drop the `EntityTable<FxRateRow, any>` suppress; keep the suppress if Dexie's generics still refuse.

## Global constraints (binding on every plan task)

- TDD; tests mock Groq (text + vision) and R2 — CI never hits external services.
- Secrets after Phase 3: `GROQ_API_KEY`, `CRON_SECRET`, `VAPID_PRIVATE_KEY` (+ `VAPID_PUBLIC_KEY` as a plain var). No others.
- New npm dependencies: **jose promoted to direct only.** Nothing else without flagging.
- Cron routes keep bearer auth with the constant-time compare; the shim adds no alternate auth path.
- Digest LLM sees aggregates only; digest emission never depends on LLM success (deterministic fallback summary).
- Vision output is Zod-clamped before entering any payload; vision text is treated as data.
- Push subscriptions and notifications are server-only tables; insights are op-log entities. Do not mix the models.
- Per-field LWW invariants unchanged; `schema keys ⊆ *_FIELDS` consistency test guards all entity kinds.
- Git identity for commits: `sdsheikahamed@gmail.com`.

## Build phases

| Sub-phase | Content | ~Tasks |
|---|---|---|
| 3.0 | Cron dispatch shim, CRON_SECRET CI check, wrangler crons, dev-mode scheduled verification | 4 |
| 3.1 | Migration 0004, Kysely/Dexie v4/Zod insight spine, applyLocalOp + materializeRow, serverHlcFor extraction, consistency test | 7 |
| 3.2 | Digest cron (aggregation + narrative + fallback + idempotency), DigestCard + dismissal | 6 |
| 3.3 | web-push lib (VAPID/JOSE), subscribe/pending routes, SW push + notificationclick, useUserPushSubscription + prefs toggle + nudge | 7 |
| 3.4 | due-tasks sweep cron, digest push hookup, prune-on-410/failed_count | 4 |
| 3.5 | R2 binding + deploy step, /api/receipt SSE + vision + clamp, receipt-sse client, camera button + chip thumbnail, receipt_queue + drain, receipt viewer + 📎 | 9 |
| 3.6 | Web Locks drain guard, prefs a11y + error surface, Dexie typing attempt | 3 |
| 3.7 | Whole-branch review, retro scaffold, eval notes | 3 |
| | **Total** | **~43** |

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| OpenNext custom-entry wrapping fights the build | Medium | Pin approach from OpenNext docs at plan time; `wrangler dev --test-scheduled` gate; documented fallback: standalone dispatcher Worker |
| Groq vision model naming/availability drift | Medium | Pin exact model ID at plan time from live models endpoint; wrapper isolates the ID in one constant |
| Vision extraction accuracy < usable | Medium | Chip is always human-confirmed before commit; 10-receipt manual eval gates the retro; failure path keeps the photo |
| JOSE ES256 on Workers runtime quirks | Low | compatibility_date 2026-06-15 is far past WebCrypto EC maturity; unit-test JWT shape; JOSE is Workers-supported |
| iOS push flakiness | Medium | Accepted: Android/desktop primary; iOS best-effort; visible-notification rule honored via fallback notification |
| 15-min cron × Workers free tier | Low | 96 fires/day, single-user D1 query each — far under limits |
| Cron-trigger count cap (free tier allows 5 schedules) | Low | We use exactly 5 (recur, fx, due-tasks, digest×2); any 6th schedule requires consolidating the digest fires behind an hourly Monday pattern |
| Dexie v4 upgrade path | Low | Additive stores only; test fresh + v3→v4 upgrade |
| Digest fires before user has data | Low | Skip users with zero entries and zero tasks in window (no empty digests) |

## Success criteria

**Behavioral (Sheik-verified over ≥7 days):**
- `wrangler tail` shows all four crons firing on schedule; recurring entries + FX rows resume materializing (the 3.0 bug's fix proof)
- Push received on Android/desktop and installed-iOS PWA: due-task within 15 min of `due_at`; digest Monday ~08:00 IST
- Digest card renders offline; dismissal sticks per device; skipped-currency footnote appears when a rate is missing
- Photo of a real receipt → correct amount+currency chip ≥8/10 attempts; 📎 opens the stored photo; offline capture drains on reconnect
- Two tabs open: no double-drain of voice/receipt queues (Web Locks)

**Technical:**
- ~360+ tests passing; typecheck/lint/audit clean; Phase 0/1/2 suites untouched-green
- Consistency test covers all five payload-schema'd entity kinds
- No secrets beyond the declared set; no new deps beyond jose-direct

## Decision log

| Decision | Choice | Rejected alternatives |
|---|---|---|
| P3 scope | Trio + polish | Deepen-domains; Big-Four completion |
| Insight shape | Weekly digest only | On-demand Q&A; both |
| Digest surface | Card on Money tab + push | New Insights tab; push-only |
| Push triggers | Due tasks + digest | Due-only; +overdue nag |
| Receipt photos | Keep in R2, linked | Parse-and-discard |
| Insight storage | Op-log entity (offline-first) | Server-only table |
| Push scheduling | 15-min cron sweep | Durable Object alarms |
| Push payload | Pull-on-push (no RFC 8291) | Encrypted payloads |
| Cron bug timing | Fix as sub-phase 3.0 | Hotfix branch now |
