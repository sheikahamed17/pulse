# Transfers between accounts — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Move money between your own accounts (A→B) in one action — excluded from spend/income everywhere, so it never distorts totals; it only shifts per-account balances (net worth unchanged). Completes the accounts feature (card payments / savings contributions now log cleanly).

**Architecture:** A NEW persisted `entity_kind: 'transfer'` (its own table — NOT two flagged money entries). Because all spend/income/budget/analytics code reads `money_entries` and sums by `direction`, a separate entity is invisible to them **by construction**. The ONLY math that changes is account balances: a transfer folds into an account's delta as an `in` on `to_account_id` and an `out` on `from_account_id`, so the existing `asset = opening+delta` / `liability = opening−delta` formulas apply unchanged.

## Design decisions (resolved)

- **Separate `transfer` entity** (not flagged money entries) — cleanest exclusion from all money aggregations.
- **Same-currency v1:** a transfer has ONE `amount` + `currency`; the create UI restricts the destination picker to accounts matching the source account's currency, so `transfer.amount` is in both accounts' currency (no FX needed inside `accountBalance`). Cross-currency transfers (different received amount) = deferred.
- **Net worth is unchanged by a transfer** (source −x, destination +x through the same asset/liability formulas). ⇒ `netWorthSeries` needs NO change (a transfer's net-worth effect is 0); add a test to LOCK this invariant.
- **Placement:** a dedicated `/settings/transfers` page (create + list + delete), mirroring the accounts/goals CRUD pages; linked from Settings and the accounts dashboard widget. **Deferred:** natural-language/voice transfer capture; showing transfers inline in the money list; recurring transfers.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (`new Date().getTime()` in a memo).
- New `entity_kind 'transfer'` requires ALL of (mirror `account`/`goal`): `op-schemas/transfer.ts`, `TRANSFER_FIELDS` (`entity-fields.ts`), Dexie `TransferRow` + **`this.version(12).stores({ transfers: 'id, user_id' })`** + `resetDb` clear, `db.ts` type, `materialize.ts` case, `sync-client.ts` applyLocalOp case + the Dexie transaction table list, ops-union if present. Round-trip test BOTH sides.
- Migration (transfers table) applied to remote D1 MANUALLY post-merge — **DDL one statement at a time** (`node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "<one stmt>"`); **retry a lone transient "A request to the Cloudflare API failed"**; the Deploy workflow only auto-applies 0001–0004.
- **`accountBalance`/`netWorth`/`goalProgress` gain a REQUIRED `transfers` param** (fail-closed: the type checker then forces every caller to pass it — that IS the blast-radius guard). `netWorthSeries` is UNCHANGED.
- Amounts minor units (÷100 display, JPY÷1); reuse `currencySymbol`/`SUPPORTED_CURRENCIES`, `useAccounts`, the categories/accounts/goals-page + widget patterns.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/dashboard`, `/settings/transfers` 200. **Whole-branch opus review** (new entity_kind + migration + sync-core + a signature change rippling through 3 balance callers): verify both-sides persistence, that EVERY `accountBalance`/`netWorth`/`goalProgress` caller passes transfers, the fold-in signs (card payment reduces owed), same-currency assumption, and that a transfer leaves net worth (and the net-worth series) unchanged.

## Reference (mirror exactly)

- **Account entity** (the mirror): `src/lib/op-schemas/account.ts`, `ACCOUNT_FIELDS`, `materialize.ts` `case 'account'`, `sync-client.ts` `case 'account'` + txn list, `AccountRow` + `this.version(10)`, `db.ts` accounts, `migrations/0017_accounts.sql`, `src/hooks/use-accounts.ts`, `src/app/settings/accounts/page.tsx`, `src/app/settings/page.tsx` links.
- **Goal entity** (a second, even more recent mirror): op-schema/goal.ts, migration 0018, settings/goals/page.tsx.
- `accountBalance` / `netWorth` in `src/lib/accounts.ts`; `goalProgress` in `src/lib/goals.ts`.
- Balance-math callers (Task 2 must update ALL): `src/components/dashboard/accounts-widget.tsx`, `src/app/analytics/page.tsx`, `src/components/dashboard/goals-widget.tsx`.

---

### Task 1: `transfer` entity data model (both sides)

**Files:**
- Create: `migrations/0019_transfers.sql`, `src/lib/op-schemas/transfer.ts`
- Modify: `src/lib/entity-fields.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`, `src/lib/materialize.ts`, `src/lib/sync-client.ts`, `src/types/ops.ts` (if entity_kind is a union — grep)
- Test: extend the sync/materialize round-trip tests

**Interfaces (Produces):**
- `TransferPayloadSchema` (zod, mirror account.ts): `from_account_id` (string min1), `to_account_id` (string min1), `amount` (int ≥1), `currency` (enum SUPPORTED_CURRENCIES), `occurred_at` (string ISO), `note` (string ≤120 nullable optional). `TransferPayload` type.
- `TransferRow` (dexie): `{ id, user_id, from_account_id:string, to_account_id:string, amount:number, currency:string, occurred_at:string, note:string|null, field_hlcs, deleted_at, created_at, updated_at }`.
- `TRANSFER_FIELDS = ['from_account_id','to_account_id','amount','currency','occurred_at','note'] as const`.

- [ ] **Step 1: Migration** `migrations/0019_transfers.sql`:
```sql
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  from_account_id TEXT NOT NULL,
  to_account_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id);
```
(Apply to remote later as SEPARATE `--command`s: the CREATE, then the INDEX.)
- [ ] **Step 2: op-schema** `src/lib/op-schemas/transfer.ts` (mirror `account.ts`).
- [ ] **Step 3: entity-fields** add `TRANSFER_FIELDS`.
- [ ] **Step 4: Dexie** `dexie.ts`: `TransferRow`; `transfers!: EntityTable<TransferRow,'id'>`; `this.version(12).stores({ transfers: 'id, user_id' })` (NEW version — do NOT mutate v11); `db.transfers.clear()` in `resetDb`.
- [ ] **Step 5: db.ts** Kysely `transfers` table interface.
- [ ] **Step 6: materialize** `case 'transfer': return materializeRow_LWW(db, op, userId, 'transfers', TRANSFER_FIELDS)` (add `'transfers'` to the tableName union type).
- [ ] **Step 7: sync-client** `case 'transfer'` (get→applyOp→put) + add `db.transfers` to the transaction table list.
- [ ] **Step 8: ops union** add `'transfer'` if enumerated.
- [ ] **Step 9: Tests** — round-trip: a `transfer` create op → server D1 `transfers` row + client Dexie `transfers` row both carry from/to/amount/currency/occurred_at; an update op (per-field LWW) changing only `note` leaves `amount`.
- [ ] **Step 10: Gate** `pnpm lint && pnpm typecheck && pnpm test sync materialize transfer && pnpm build` → pass. **Step 11: Commit** named files.

---

### Task 2: fold transfers into balance math + thread through all callers

**Files:**
- Modify: `src/lib/accounts.ts`, `src/lib/goals.ts`, `src/components/dashboard/accounts-widget.tsx`, `src/app/analytics/page.tsx`, `src/components/dashboard/goals-widget.tsx`
- Create: `src/hooks/use-transfers.ts`
- Test: `src/lib/accounts.test.ts` + `src/lib/goals.test.ts` (extend)

**Interfaces (Produces / changes):**
- `type TransferLike = { id: string; from_account_id: string; to_account_id: string; amount: number; currency: string; deleted_at?: string | null }`
- `accountBalance(account: AccountLike, entries: MoneyEntryRow[], transfers: TransferLike[], toAcct: (e) => number): number` — after the existing entry delta, for each transfer with `!t.deleted_at`: if `t.to_account_id === account.id` → `delta += t.amount`; else if `t.from_account_id === account.id` → `delta -= t.amount`. (v1 same-currency: `t.amount` is already in the account's currency — NO conversion.) Then asset `opening+delta` / liability `opening−delta` unchanged.
- `netWorth(accounts, entries, transfers: TransferLike[], toAcct, toPrimary)` — thread `transfers` into each `accountBalance(...)` call. Everything else unchanged.
- `goalProgress(goal, accounts, entries, transfers: TransferLike[], toAcct)` — thread `transfers` into the `accountBalance(...)` call for account-linked goals.
- `netWorthSeries` — **UNCHANGED** (transfers have zero net-worth effect).
- `useTransfers(userId): TransferRow[]` — non-deleted, sorted by occurred_at desc [mirror use-accounts pattern but no is_archived].

- [ ] **Step 1: Failing tests** in `accounts.test.ts`:
  - `accountBalance` asset A opening 100000, a transfer OUT 30000 (from=A) → 70000; a transfer IN 20000 (to=A) → +20000.
  - `accountBalance` liability card opening owed 200000, a transfer IN 50000 (to=card, a payment) → owed = 200000 − 50000 = 150000 (payment reduces owed). ✓
  - deleted transfer ignored.
  - `netWorth` with A (asset) and card (liability) + a transfer A→card 50000: A drops 50000, card owed drops 50000, **net worth unchanged** vs no transfer.
  - **INVARIANT: `netWorthSeries` output is IDENTICAL with vs without a transfer in the data** (transfers don't affect the series) — assert equality.
- [ ] **Step 2: Failing test** in `goals.test.ts`: an account-linked goal whose linked account receives a transfer IN → `goalProgress.current` rises by the transfer amount.
- [ ] **Step 3: Implement** the signature changes in `accounts.ts` + `goals.ts` → tests pass.
- [ ] **Step 4: `use-transfers.ts` hook** (mirror use-accounts, no archived filter; sort by occurred_at desc).
- [ ] **Step 5: Update ALL 3 callers** — add `useTransfers(userId)` and pass it into `netWorth(...)` / `goalProgress(...)`:
  - `accounts-widget.tsx` (netWorth call),
  - `analytics/page.tsx` (the `currentNet = netWorth(...)` call),
  - `goals-widget.tsx` (goalProgress call).
  Map `TransferRow[]` → `TransferLike[]` (same shape; pass directly). Confirm `netWorthSeries` call in analytics is untouched.
- [ ] **Step 6: Gate** `pnpm lint && pnpm typecheck && pnpm test accounts goals && pnpm build` → all green (build proves every caller compiles with the new required param). **Step 7: Commit** named files.

---

### Task 3: `/settings/transfers` page (create + list) + surfacing

**Files:**
- Create: `src/app/settings/transfers/page.tsx`
- Modify: `src/app/settings/page.tsx` (a "Transfers" link), `src/components/dashboard/accounts-widget.tsx` (a small "Transfer" link to /settings/transfers)

- [ ] **Step 1: page** `settings/transfers/page.tsx` (mirror `settings/accounts/page.tsx` structure): auth shell; a **create form**:
  - `from` `<select>` of `useAccounts(userId)` (all accounts); `to` `<select>` of accounts **filtered to the same currency as the selected `from` account AND `id !== from`** (so same-currency v1 holds; disable submit if none); amount input (`parseAmountInput` → minor units, in the from-account's currency); optional date (default today) + optional note (≤120).
  - Validate: from & to selected, from ≠ to, amount > 0. On submit → a `transfer` create op (`generateOp` entity_kind:'transfer', payload {from_account_id, to_account_id, amount, currency: fromAccount.currency, occurred_at, note: note||null}, applyLocalOp, pushPullOnce). Reset form.
  - A **list** of `useTransfers(userId)`: each row = `{fromName} → {toName}` · amount (currency symbol, ÷100/JPY÷1) · date · note; a Delete button → a delete op (soft-delete). Resolve account names via a `useAllAccounts` map (archived/deleted → "Unknown account"). Empty state: "No transfers yet."
  - 44px targets + aria-labels. No `Date.now()` in render (use `new Date()` in the submit handler only).
- [ ] **Step 2: settings link** add a 44px "Transfers" entry in `settings/page.tsx` near "Accounts".
- [ ] **Step 3: widget link** in `accounts-widget.tsx`, add a small "Transfer →" `<Link href="/settings/transfers">` in the widget header/footer (only meaningful when accounts exist).
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (full suite + build; build prerenders /settings/transfers). **Step 5: Commit** named files.

## Self-review

- **Coverage:** transfer entity both-sides + migration (T1) · balance-math fold-in + all 3 callers threaded + net-worth-series invariant (T2) · create/list/delete UI + surfacing (T3). Same-currency v1; NL/voice + inline-money-list + recurring transfers deferred. ✓
- **Placeholders:** none — schema/fields/migration exact; fold-in signs + test cases explicit; UI mirrors named pages; caller list enumerated.
- **Type consistency:** `TransferPayload`/`TransferRow`/`TRANSFER_FIELDS` (T1) → `TransferLike` + the balance-math signature changes (T2) → page/hook (T3). `accountBalance`/`netWorth`/`goalProgress` gain a REQUIRED `transfers` param (compile-time blast-radius guard).
- **Guards:** deleted transfers ignored; from≠to + amount>0 validated; same-currency destination filter; unknown/archived account name fallback; net worth + net-worth series provably unaffected by a transfer (tests).

## Post-merge (owner)

Apply migration 0019 to remote D1 (transfers CREATE TABLE + index — SEPARATE `--command`s, retry a transient API error) + verify with `pragma_table_info`. Then Settings → Transfers → move money between accounts (e.g. Bank → Savings, or Bank → Credit card as a payment) → see balances + net worth update, and the linked savings goal advance.
