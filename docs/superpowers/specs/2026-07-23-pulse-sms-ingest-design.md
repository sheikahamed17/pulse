# SMS Transaction Auto-Ingest — Design

**Date:** 2026-07-23
**Status:** Approved (design). Build is **phased**: Phase 1 = the ingest pipeline (backend, curl-testable, ships independently); Phase 2 = Settings UI + provenance badge + Shortcut guide.
**Feature:** Automatically turn bank transaction SMS into Pulse money entries via an iOS Shortcut → an authenticated ingest endpoint → Groq parse → a server-created money op that syncs to the client.

## Goal

The user (India, INR, iPhone PWA) wants transactions pulled in automatically. iOS won't let a PWA read SMS, but an **iOS Shortcuts "When I receive a message" automation** (Run Immediately) can read a matching SMS and `POST` it to Pulse. Pulse parses it and adds a money entry — auto-added, tagged `source:'sms'`, fixable via the existing edit + undo.

## Why this shape

- iPhone SMS is reachable only via the Shortcuts bridge (confirmed current + India-proven); the PWA itself cannot read SMS.
- Auto-add (not a review queue): SMS arrive while the app is closed, so a server-created op that simply appears on next sync is the natural fit; the `parse_sms` agent skips non-transactions, and edit/undo handle mistakes.
- Reuses two existing patterns wholesale: **server-writes-an-op** (insight/digest cron: build `Op` → `op_log` → `materializeRow`) and **Groq parse agent** (`money-agent.ts` + `callGroqJSON`, injection-guarded like the receipt agent).

## Architecture

```
Bank SMS ─(iOS Shortcut: When I receive a message from <bank IDs>, Run Immediately,
            Get Message Details, Get Contents of URL)→ POST /api/ingest/sms
            headers: Authorization: Bearer pulse_sms_{userId}_{secret}
            body: { text, sender? }
  → validate token (parse userId, load user_prefs hash, compare sha256(secret))
  → parse_sms (Groq) → { is_transaction, amount, currency?, direction, merchant? }
  → if is_transaction: build money payload → dedup entity_id = sms-{sha256(userId+text)}
       → Op{ op_type:'create', hlc: serverHlcFor(now), device_id:'sms-ingest' }
       → op_log (on-conflict-do-nothing) → materializeRow
  → { ok, added }
Client pushPullOnce → entry appears (source:'sms', 💳 badge).
```

### Ingest token (new headless-auth primitive)

- A Shortcut can't do passkey/session, so it uses a personal token: **`pulse_sms_{userId}_{secret}`**. The endpoint reads `userId` from the token, loads that user's stored `sms_ingest_token_hash`, and compares `sha256(secret)` — a standard id-plus-secret API key (direct user lookup, no scan), revocable by regenerating.
- Stored as a new **`sms_ingest_token_hash TEXT`** column on `user_prefs` (server-only; migration `0014`, applied to remote via `wrangler d1 execute … --remote --command`). Never store plaintext.
- Pure helpers `makeIngestToken(userId): { token, hash }` and `parseIngestToken(token): { userId, secret } | null` + `hashSecret(secret)` — unit-tested.

### `parse_sms` agent

`src/lib/agents/sms-agent.ts` + prompt + Zod response schema, mirroring `money-agent.ts`:
- Input: raw SMS text (treated as **data** — injection-guarded, same as the receipt agent).
- Output: `{ is_transaction: boolean, amount?: number, currency?: string, direction?: 'out'|'in', merchant?: string }`, Zod-clamped. `amount` is in **minor units** (paise/cents; whole units for JPY) — the agent multiplies the SMS's major-unit figure (e.g. "Rs.500.00") by 100 except for JPY, matching how the money agent + op-schema store amounts.
- `reasoning_effort:'low'` + the shared `REASONING_HEADROOM` (gpt-oss token lesson). Bank-SMS-tuned prompt (UPI / debit / credit / card formats; INR default). OTP/promo/non-transaction → `is_transaction:false`.
- Pure `smsToMoneyPayload(parsed, primaryCurrency, nowIso, text)` builds the money payload (`amount`, `currency` parsed-or-primary, `direction`, `category_id:null`, `description:merchant ?? null`, `occurred_at:nowIso`, `source:'sms'`, `raw_input:text`) — unit-tested.

### Endpoint `POST /api/ingest/sms`

Token auth → 403 on bad/missing token. Body `{ text: string; sender?: string }` (validated). `parse_sms` → if not a transaction, `{ ok:true, added:false }`. Else build payload; dedup `entity_id = 'sms-' + sha256(userId + '\n' + text)` and deterministic `op.id = 'smsop-' + <same hash>`; create the op (`serverHlcFor(now)`, `device_id:'sms-ingest'`), insert to `op_log` **on-conflict-do-nothing**, `materializeRow`. Returns `{ ok:true, added:true }`. Re-POSTing the same SMS is idempotent (same ids → no duplicate).

### `POST /api/ingest/token` (session-authed)

Generates a fresh token, stores its hash in `user_prefs`, returns the plaintext **once** (`{ token }`). Regenerating overwrites the hash (old token dies). Session auth like the other authed routes (e.g. `/api/insights/generate`, `/api/admin/backfill`).

### Provenance + `source:'sms'`

Add `'sms'` to the money op-schema `source` enum + the `MoneyEntryRow`/`MoneyPayload` types + Kysely. money-list renders a small "💳 SMS" badge when `source==='sms'` (mirrors the 📎 receipt chip).

### Settings UI + Shortcut guide (Phase 2)

Settings → "Auto-import from SMS": generate/regenerate token (shown once) + the endpoint URL + a step-by-step iOS Shortcut setup guide (Create Personal Automation → *When I Receive a Message* from your bank IDs → Run Immediately → Get Message Details → Get Contents of URL POST with the token header + message text).

## Phasing

- **Phase 1 (backend pipeline — ships first):** migration 0014 + `user_prefs` field wiring; token helpers + tests; `parse_sms` agent + `smsToMoneyPayload` + tests; `POST /api/ingest/token`; `POST /api/ingest/sms` + dedup + server-op + route test; `source:'sms'` in the op-schema/types. End state: a working, curl-testable pipeline (generate a token, POST an SMS, see the entry sync down). Merge + deploy + apply 0014 to remote.
- **Phase 2 (UX):** Settings "Auto-import from SMS" UI; money-list 💳 badge; iOS Shortcut setup guide + QA runbook. Merge + deploy.

## Error handling

- Bad/missing token → 403. Malformed body → 400. `parse_sms` failure (Groq error) → 502 with a logged error (the Shortcut can retry). Non-transaction → 200 `{added:false}` (not an error). Duplicate SMS → idempotent (no dupe). Pre-migration on remote: the token-generate + ingest write need the `user_prefs` column → **0014 must be applied to remote around the Phase-1 deploy** (as with 0013).

## Testing

**Unit:** token helpers (make → parse → verify round-trip; tampered token rejected); `smsToMoneyPayload` (amount/currency/direction/merchant mapping, currency default, source='sms'); dedup `entity_id` determinism.
**Route (`tests/api/ingest-sms-route.test.ts`, fake DB + mocked `parse_sms`, mirroring `cron-due-tasks-route.test.ts`):** bad token → 403; a transaction → one op created (right payload); non-transaction → no op, `added:false`; duplicate POST → idempotent (one op).
The parse *quality* on real bank-SMS formats is model-dependent (LLM mocked in tests) → **owner-verified on real SMS** on-device.

## Constraints (verbatim)

- No new dependency; no paid API (Groq free, Shortcuts free, Workers free). Cloudflare stack + local-first op-log.
- Migration `0014` applied to remote via `wrangler d1 execute pulse --remote --command "…"` (NOT `--file`).
- SMS text is **data** — injection-guarded (Zod-clamped agent output), like the receipt agent.
- Auto-add with `source:'sms'`; dedup deterministic per SMS; token stored hashed, plaintext shown once.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED.
