# Pulse — Accounts & balances (design)

**Date:** 2026-08-12
**Status:** draft for review

## Problem

Pulse tracks money **flows** (in/out) but has no notion of **where money lives** or **how much is there**. There's no account balance and no net worth — so it's an expense log, not a personal-finance tool. Adding lightweight accounts + derived balances + net worth turns per-transaction data into a running financial picture.

## Goals (v1)

1. An **`account`** entity: name, type (**asset** | **liability**), opening balance, currency, icon, archive/restore. Managed in **Settings → Accounts** (mirrors the Categories page).
2. An optional **`account_id`** on money entries — assign an entry to an account (nullable; existing/unassigned entries affect no balance).
3. **Derived balances** (computed client-side from the account's opening balance + its entries — never stored/synced as a number, so there's no stale-balance surface): per-account current balance + **net worth = Σ assets − Σ liabilities**.
4. **Surface**: a new **`accounts` dashboard widget** (net worth headline + per-account list) — reusing the widget system shipped this week — plus the Settings management page.

## Non-goals (v1 — explicit)

- **No transfers** (owner chose defer). To move money between accounts now, log an `out` on one + an `in` on the other. First-class transfers = a clean follow-up slice.
- No stored/materialized balance number; balances are always derived (avoids a convergence problem under HLC LWW).
- No auto-assignment of ingested transactions to a "card" account (leave `account_id` null; user assigns). A follow-up could map HDFC card ingests to a card account.
- No account-scoped filter on the money list in v1 (can add later); no net-worth-over-time chart (follow-up).
- No overdraft/interest modeling; balances are pure sums.

## Sign conventions (the crux — review carefully)

Each account has a **type** and an **`opening_balance`** (signed integer, minor units, in the account's currency) = the balance at creation, entered as a positive magnitude:
- **asset** opening = cash on hand (e.g. ₹5,000 → `500000`).
- **liability** opening = amount owed at creation (e.g. card owes ₹2,000 → `200000`).

For the entries assigned to an account, define the natural **cash-flow delta**:
```
delta = Σ over the account's non-deleted entries: (entry.direction === 'in' ? +amount : −amount)
```
Then:
- **asset.current  = opening_balance + delta**   (an `out`/spend lowers it; an `in`/income raises it)
- **liability.owed = opening_balance − delta**    (an `out`/spend on the card RAISES what you owe; an `in`/credit lowers it)
- **net worth      = Σ(asset.current) − Σ(liability.owed)**

(Worked: create a card with opening owed ₹2,000; spend ₹500 on it → an `out` entry → delta = −500 → owed = 2000 − (−500) = ₹2,500 ✓. Pay ₹1,000 toward it → an `in` entry → delta += 1000 → owed drops ₹1,000 ✓.)

## Currency

Accounts carry a `currency`. An account's balance is computed in **its own currency**: each assigned entry is converted to the account currency via the app's `convertViaRates` (same fallback as money-card: a missing rate → the entry is skipped and its currency flagged). **Net worth** converts each account's balance to the user's **primary** currency the same way. Single-currency users (INR) hit no conversion. This reuses the exact FX pattern already in money-card/analytics — no new FX machinery.

## Architecture

### New `account` entity (the new-entity_kind gotcha — BOTH sides)

Per the durable rule, a new persisted `entity_kind` needs **all** of:
- `src/lib/op-schemas/account.ts` — `AccountPayloadSchema` (name 1–40, type enum, opening_balance int, currency enum, icon ≤8 nullable, is_archived 0|1).
- `src/lib/entity-fields.ts` — `ACCOUNT_FIELDS`.
- `src/lib/dexie.ts` — `AccountRow` + a new Dexie table (**a `db.version(N+1).stores({ accounts: 'id, user_id' })` bump** — new table).
- `src/lib/db.ts` — the Kysely `accounts` table type + `money_entries.account_id`.
- `src/lib/materialize.ts` — `case 'account': materializeRow_LWW(db, op, userId, 'accounts', ACCOUNT_FIELDS)`.
- `src/lib/sync-client.ts` — `applyLocalOp` `case 'account'` + add `db.accounts` to the transaction table list.
- Migration: `accounts` table + `ALTER money_entries ADD COLUMN account_id TEXT`.
Round-trip tested on BOTH sides (server materialize + client Dexie), like budgets/merchant-tags.

### Money `account_id` link
`account_id` added to `MONEY_FIELDS` (drives server materialize + client apply) + the money op-schema (`account_id: string | null` optional) + `MoneyEntryRow`/`db.ts`. Capture (chip account picker, manual/blank/entry-to-draft/undo) + display (a small account badge on money rows) set/show it. Nullable → all existing entries are backward-compatible.

### Pure balance math (`src/lib/accounts.ts`, unit-tested)
- `accountBalance(account, entries, toAcctCurrency): number` — the signed current balance per the conventions above (entries converted to the account currency).
- `netWorth(accounts, entriesByAccountId, toPrimary): { net: number; assets: number; liabilities: number; perAccount: {id;name;type;icon;balance}[] }`.
- `toAcctCurrency`/`toPrimary` are injected FX fns (same shape money-card uses) → the core stays pure + testable.

### Management + surface
- **`src/app/settings/accounts/page.tsx`** — mirrors the Categories page: create (name, type, opening balance, currency, icon), rename, edit opening balance, archive/restore + an Archived section. `useAccounts` / `useArchivedAccounts` hooks. No merge (accounts aren't duplicated). Empty state: "Add your first account."
- **`accounts` dashboard widget** — add `'accounts'` to `WIDGET_CATALOG` + the `WidgetCard` dispatcher → `<AccountsWidget userId>`: net-worth headline + a per-account balance list (asset/liability grouped; liabilities shown as owed). NOT added to the default seed set (users add it once they have accounts). A Settings→Accounts link too.

## Data flow

```
Settings → Accounts: create/edit/archive → account op → applyLocalOp → pushPullOnce
Money capture: chip account picker → money op payload {account_id} (per-field LWW)
Balances (pure, client): useAccounts + useMoneyEntries + FX
  → accountBalance(acct, its entries) per account
  → netWorth(accounts, entriesByAccountId) → widget headline + list
```

## Correctness invariants (tested)

1. **Signs:** asset spend lowers balance; liability spend raises owed; the worked examples above hold; net worth = Σassets − Σliabilities.
2. **Opening balance** included exactly once; an account with no entries shows exactly its opening balance.
3. **Unassigned entries** (account_id null) affect NO account balance and net worth.
4. **Both-sides persistence:** an `account` op materializes server-side (D1 `accounts`) AND client-side (Dexie `accounts`); a money op's `account_id` round-trips both sides; per-field LWW (editing account_id doesn't clobber other money fields; editing an account's name doesn't clobber its opening_balance).
5. **Legacy/empty guards:** existing money rows have no `account_id` (undefined) → treated as unassigned, never crash; zero accounts → net-worth widget shows an empty state; a money row referencing an archived/deleted account still renders (name resolved across all accounts, else "Unknown account").
6. **FX:** cross-currency entries convert via `convertViaRates` (missing rate → skipped + flagged), matching money-card; JPY minor-unit handling preserved.
7. **Migration safety:** `accounts` CREATE + `account_id` ALTER are additive/backward-compatible; must be applied to remote D1 manually (≥0005).

## Testing

- **Pure:** `accountBalance` + `netWorth` (asset/liability/opening/in/out/mixed/empty/unassigned/FX-skip); op-schema parse bounds. TDD.
- **Round-trip:** account op → server materialize + client Dexie; money `account_id` both sides (extend the sync/materialize tests).
- Management page + widget are presentational → `pnpm lint && typecheck && build` + QA runbook.
- Full gate `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; **opus whole-branch review** (2 schema changes + new entity_kind + sync-core — MUST check legacy-undefined `account_id`, zero-accounts, archived-account reference, sign math).

## Global constraints

- New `entity_kind` 'account' → BOTH server materialize.ts AND client sync-client.ts applyLocalOp + the Dexie txn list + a Dexie version bump for the new table (the classic gotcha).
- Migrations (accounts table + money.account_id) applied to remote D1 MANUALLY (`wrangler d1 execute pulse --remote --command`, via the wrangler binary) + verified — the Deploy workflow only auto-applies 0001–0004.
- Gate MUST include `pnpm lint`. No `Date.now()` in render/useMemo. Amounts minor units (÷100 display, JPY ÷1). Reuse `convertViaRates`/`currencySymbol`/`SUPPORTED_CURRENCIES`, the categories-page + budget-entity + widgets patterns.
- Merging to `main` auto-deploys; verify CI + Deploy green + prod `/app`, `/dashboard`, `/settings/accounts` 200. git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.

## Deferred follow-ups (noted, not built)
Transfers (first-class); net-worth-over-time chart; account filter on the money list; auto-assign ingested card txns to a card account; per-account reconciliation.
