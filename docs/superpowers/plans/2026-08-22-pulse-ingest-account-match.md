# Auto-detect account from bank/card alerts — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** When a payment is auto-ingested from a bank/card SMS or email alert, tag the entry to the matching account/card automatically (so you can see which card each payment came from) — no manual picking.

**Architecture:** Add a `match_hints` field to the **existing** `account` entity (a new COLUMN, not a new entity). In the ingest route, after the parser builds the money payload, match the raw alert text against each account's hints (deterministic substring match — no LLM change) and set `payload.account_id`. The money list already renders an account badge, so auto-assigned entries display with no UI change.

## Design decisions (resolved)

- **Deterministic raw-text matching**, not LLM extraction: `matchAccountFromText(text, accounts)`. The parser is unchanged; matching is a pure, testable substring check of the user-configured hints against the alert body. (Alerts format card/account identifiers distinctively — "XX5678", "ending 5678", "HDFC Credit Card" — so the user's configured last-4/keywords match reliably.)
- **`match_hints`** = a free-text field on an account: comma/newline-separated tokens (card last-4 and/or keywords, e.g. `5678, hdfc credit`). A token matches if (case-insensitively) it is a substring of the alert text. Tokens shorter than 2 chars are ignored (avoid trivial matches). First matching **non-archived** account wins (stable order by created_at).
- **Deferred:** LLM semantic extraction; disambiguation/confidence when >1 account matches; auto-suggesting hints from history; a distinct "auto-tagged" badge. (Manual override already works — the user can change the account via the confirmation chip.)

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck).
- `match_hints` is a NEW COLUMN on the EXISTING `accounts` entity — this is the merchant/tags-on-money pattern (migration 0015), NOT a new entity_kind:
  - Add `'match_hints'` to `ACCOUNT_FIELDS` (`src/lib/entity-fields.ts`) → the generic server `materializeRow_LWW(..., ACCOUNT_FIELDS)` and the client generic `applyOp` for `account` pick it up automatically — **no materialize.ts / sync-client.ts case change, and NO Dexie version bump** (Dexie stores arbitrary fields; match_hints is not indexed).
  - Add it to `AccountPayloadSchema`, `AccountRow` (dexie), and the Kysely `accounts` interface (`db.ts`).
- Migration 0020 applied to remote D1 MANUALLY post-merge (`node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "<one stmt>"`; retry a transient "Cloudflare API failed").
- The ingest route reads accounts from the **server** materialized `accounts` table (op_log is truth, but the server-side ingest has no client Dexie — a stale server table only means a miss, never a crash).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/settings/accounts` 200, `/api/ingest/sms` unauth → 403. **Whole-branch opus review** (schema change on an entity the ingest path + balances depend on): confirm the field round-trips both sides, matching is correct + false-positive-guarded, and no existing account/ingest behavior regresses.

## Background (verified)

- `src/lib/sms-ingest.ts` `smsToMoneyPayload(r, primaryCurrency, nowIso, text, source): MoneyPayload | null` — builds the payload; does NOT set `account_id` (the gap). `account_id` is already in `MONEY_FIELDS` (accounts feature) so it materializes if present.
- `src/app/api/ingest/sms/route.ts` — line 54 builds `payload`; the op is created at line 63. Inject the account match between them. Route already loads `prefs`; add an accounts query. `dryRun` (line 56) returns `{agentOut, payload}` — the matched `account_id` will show there too (good for testing).
- Account entity: `src/lib/op-schemas/account.ts`, `ACCOUNT_FIELDS` (`name,type,opening_balance,currency,icon,is_archived`), `AccountRow` (`src/lib/dexie.ts`), accounts in `db.ts`, `migrations/0017_accounts.sql`. Settings page `src/app/settings/accounts/page.tsx`.

---

### Task 1: account `match_hints` field

**Files:**
- Create: `migrations/0020_account_match_hints.sql`
- Modify: `src/lib/entity-fields.ts`, `src/lib/op-schemas/account.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`
- Test: extend the account round-trip test

**Interfaces (Produces):**
- `AccountPayloadSchema` gains `match_hints: z.string().max(200).nullable().optional()`.
- `AccountRow` gains `match_hints: string | null`.
- `ACCOUNT_FIELDS` gains `'match_hints'`.

- [ ] **Step 1: Migration** `migrations/0020_account_match_hints.sql`:
```sql
ALTER TABLE accounts ADD COLUMN match_hints TEXT;
```
- [ ] **Step 2:** `entity-fields.ts` — append `'match_hints'` to `ACCOUNT_FIELDS`.
- [ ] **Step 3:** `op-schemas/account.ts` — add `match_hints` (string, max 200, nullable, optional) to `AccountPayloadSchema`.
- [ ] **Step 4:** `dexie.ts` — add `match_hints: string | null` to `AccountRow` (no version bump; it's an unindexed field).
- [ ] **Step 5:** `db.ts` — add `match_hints: string | null` to the Kysely accounts table interface.
- [ ] **Step 6: Test** — extend the account round-trip test: an `account` create op carrying `match_hints` materializes it to the server `accounts` row AND the client Dexie row; an update op changing only `match_hints` leaves `name`/`opening_balance` (per-field LWW). Grep tests for any `AccountRow`/`AccountPayload` literal that must now typecheck.
- [ ] **Step 7: Gate** `pnpm lint && pnpm typecheck && pnpm test account materialize sync && pnpm build` → pass. **Step 8: Commit** named files.

---

### Task 2: pure `matchAccountFromText`

**Files:** Create `src/lib/account-match.ts`, `src/lib/account-match.test.ts`

**Interfaces (Produces):**
- `type MatchableAccount = { id: string; match_hints: string | null; is_archived: number; deleted_at?: string | null; created_at?: string }`
- `matchAccountFromText(text: string, accounts: MatchableAccount[]): string | null` — lowercase `text`; consider only accounts with `is_archived !== 1 && !deleted_at`; for each (stable order — by `created_at` asc, else input order), split `match_hints` on `[,\n]`, trim each token, drop tokens with length < 2, lowercase; if ANY token is a substring of the lowercased text → return that account's `id`. Return `null` if none match. Pure.

- [ ] **Step 1: Failing tests** `account-match.test.ts`:
  - a card account with `match_hints: '5678'` + text `"Spent Rs 500 on HDFC Card XX5678"` → returns that account id.
  - keyword hint `'hdfc credit'` matches `"...HDFC Credit Card..."` (case-insensitive).
  - no account matches → `null`.
  - archived / deleted account is skipped even if its hint matches.
  - `match_hints` null/empty → never matches.
  - a 1-char token (e.g. `'5'`) is ignored (no trivial match).
  - two accounts, only one hint present in text → the matching one; if both match, the first in stable order.
- [ ] **Step 2: Run fail → implement `account-match.ts`** → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test account-match` → pass. **Step 4: Commit** named files.

---

### Task 3: wire into ingest + Settings input

**Files:**
- Modify: `src/app/api/ingest/sms/route.ts`, `src/app/settings/accounts/page.tsx`
- Test: extend the sms-ingest route test

- [ ] **Step 1: Ingest wiring** — in `src/app/api/ingest/sms/route.ts`, after `const payload = smsToMoneyPayload(...)` (line 54) and when `payload` is non-null, load the user's accounts and set `account_id`:
```ts
if (payload) {
  const accts = await db.selectFrom('accounts')
    .where('user_id', '=', userId).where('deleted_at', 'is', null)
    .selectAll().execute()
  payload.account_id = matchAccountFromText(text, accts as unknown as MatchableAccount[])
}
```
  Place it so the `dryRun` response (line 56) reflects the matched `account_id`. (`payload.account_id` is already part of `MoneyPayload`; setting it means the created op carries it and materialize writes `money_entries.account_id`.) Import `matchAccountFromText`/`MatchableAccount` from `@/lib/account-match`.
- [ ] **Step 2: Settings input** — in `src/app/settings/accounts/page.tsx`, add a `match_hints` text input to BOTH the create form and the inline edit (label "Auto-match hints", placeholder "card last 4 or keywords, e.g. 5678, hdfc credit", maxLength 200, aria-label). Include `match_hints: matchHints.trim() || null` in the create + update op payloads. Show the current hints on each account row (muted, small) when set.
- [ ] **Step 3: Route test** — extend `tests/api/cron-...`/the sms-ingest route test (grep `tests/` for the ingest route test): with the user having an account whose `match_hints` matches the posted text, the created money op's payload has `account_id` = that account; with no matching account, `account_id` is null; an archived account's hint does not match. (Reuse the route test's fake-DB harness; stub `accounts` rows.)
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green. **Step 5: Commit** named files.

## Self-review

- **Coverage:** account match_hints field both-sides + migration (T1) · pure matcher with false-positive guards (T2) · ingest sets account_id + Settings input to configure hints (T3). Display already handled (money-list badge). LLM extraction / disambiguation deferred. ✓
- **Placeholders:** none — migration + field list exact; matcher signature + test cases explicit; ingest injection point + Settings wiring named.
- **Type consistency:** `match_hints` added to `AccountPayloadSchema`/`AccountRow`/`ACCOUNT_FIELDS`/db.ts (T1); `MatchableAccount`/`matchAccountFromText` (T2) consumed by the ingest route (T3).
- **Guards:** archived/deleted accounts skipped; <2-char tokens ignored; null/empty hints never match; stale server accounts table → a miss (null), never a crash.

## Post-merge (owner)

Apply migration 0020 to remote D1 (`ALTER TABLE accounts ADD COLUMN match_hints TEXT`) + verify with `pragma_table_info`. Then Settings → Accounts → set each card/account's auto-match hints (e.g. the card's last 4 digits). Future ingested alerts that contain those digits/keywords auto-tag to that account (visible as the account badge on the entry). Manual override still available via the confirmation chip.
