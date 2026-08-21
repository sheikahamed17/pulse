# Accounts & balances — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add an `account` entity (asset | liability) + an optional `account_id` on money entries, derive per-account balances + net worth, manage accounts in Settings, and surface it as a dashboard widget.

**Architecture:** New persisted `entity_kind: 'account'` (both server materialize + client apply + Dexie table) + a money column `account_id`. Balances are DERIVED client-side (pure math), never stored. Mirrors the **budget** entity (new-entity wiring), **merchant/tags** (money column), **categories page** (management CRUD), and the **widgets** system (dashboard card).

Design: `docs/superpowers/specs/2026-08-12-pulse-accounts-balances-design.md` (read it — sign conventions + currency are there).

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (`new Date().getTime()` in a memo/handler).
- New `entity_kind 'account'` requires ALL of: op-schema, ACCOUNT_FIELDS, Dexie `AccountRow` + a **`db.version(N+1).stores({ accounts: … })` bump** (new table — find the current max version, add the next), `db.ts` type, `materialize.ts` case, `sync-client.ts` applyLocalOp case + the Dexie transaction table list. Round-trip test BOTH sides.
- Migrations (accounts table + `money_entries.account_id`) applied to remote D1 MANUALLY post-merge (`node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "…"`) — the Deploy workflow only auto-applies 0001–0004.
- Amounts minor units (÷100 display, JPY ÷1); FX via `convertViaRates` (missing rate → skip+flag), reuse `currencySymbol`/`SUPPORTED_CURRENCIES`.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/dashboard`, `/settings/accounts` 200. **Whole-branch opus review required** (2 schema changes + new entity_kind + sync-core): MUST check legacy-undefined `account_id`, zero-accounts, archived-account reference, and the sign math.

## Reference patterns (verbatim mirrors)

- **New entity_kind:** budgets — `src/lib/op-schemas/budget.ts`, `BUDGET_FIELDS` in `src/lib/entity-fields.ts`, `materialize.ts` `case 'budget'`, `sync-client.ts` `case 'budget'` + txn list, Dexie `BudgetRow` + `this.version(7).stores({ budgets: … })`, `db.ts` budgets. **Copy this shape for `account`.**
- **Money column:** merchant/tags (slice just shipped) — `MONEY_FIELDS` in `entity-fields.ts`, `op-schemas/money.ts`, `MoneyEntryRow`/`db.ts`, chip/entry-to-draft/undo/display. **Copy for `account_id`.**
- **Management page:** `src/app/settings/categories/page.tsx` + `src/hooks/use-categories.ts` + `src/hooks/use-archived-categories.ts`.
- **Dashboard widget:** `src/lib/widgets.ts` (`WIDGET_CATALOG`, `WidgetType`) + `src/components/dashboard/widget-card.tsx` dispatcher + a widget component under `src/components/dashboard/`.

---

### Task 1: `account` entity + `money.account_id` (data model, both sides)

**Files:**
- Create: `migrations/0017_accounts.sql`, `src/lib/op-schemas/account.ts`
- Modify: `src/lib/entity-fields.ts`, `src/lib/op-schemas/money.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`, `src/lib/materialize.ts`, `src/lib/sync-client.ts`, `src/types/ops.ts` (if `entity_kind` is a union there — grep)
- Test: extend the sync/materialize round-trip tests

**Interfaces (Produces):**
- `AccountPayloadSchema` (zod): `name` (string 1–40), `type` (`'asset'|'liability'`), `opening_balance` (int, may be negative), `currency` (enum `SUPPORTED_CURRENCIES`), `icon` (string ≤8, nullable optional), `is_archived` (0|1 optional). `AccountPayload` type.
- `AccountRow` (dexie): `{ id, user_id, name, type: 'asset'|'liability', opening_balance: number, currency: string, icon: string | null, is_archived: number, field_hlcs, deleted_at, created_at, updated_at }`.
- `MoneyPayload` + `MoneyEntryRow` gain `account_id: string | null`.
- `ACCOUNT_FIELDS = ['name','type','opening_balance','currency','icon','is_archived'] as const`.

- [ ] **Step 1: Migration** `migrations/0017_accounts.sql`:
```sql
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'asset' | 'liability'
  opening_balance INTEGER NOT NULL DEFAULT 0,   -- minor units, account currency
  currency TEXT NOT NULL,
  icon TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
ALTER TABLE money_entries ADD COLUMN account_id TEXT;
```
- [ ] **Step 2: op-schema** `src/lib/op-schemas/account.ts` (mirror `budget.ts`/`category.ts` shape). Add `account_id: z.string().min(1).nullable().optional()` to `MoneyPayloadSchema`.
- [ ] **Step 3: entity-fields** add `ACCOUNT_FIELDS`; append `'account_id'` to `MONEY_FIELDS`.
- [ ] **Step 4: Dexie** `dexie.ts`: add `AccountRow`; add `account_id: string | null` to `MoneyEntryRow`; declare the table `accounts!: EntityTable<AccountRow,'id'>`; **bump the version** — find the current highest `this.version(N)` and add `this.version(N+1).stores({ accounts: 'id, user_id, [user_id+type]' })`; add `db.accounts.clear()` to `resetDb()`.
- [ ] **Step 5: db.ts** add the Kysely `accounts` table interface + `account_id: string | null` to money_entries.
- [ ] **Step 6: materialize** `materialize.ts`: add `case 'account': return materializeRow_LWW(db, op, userId, 'accounts', ACCOUNT_FIELDS)`. (money `account_id` rides MONEY_FIELDS automatically.)
- [ ] **Step 7: sync-client** `sync-client.ts`: add `case 'account': { const current = await db.accounts.get(op.entity_id); await db.accounts.put(applyOp(current as never, op) as never); return }`; add `db.accounts` to the `db.transaction('rw', [...])` table list. (money `account_id` rides the generic money apply.)
- [ ] **Step 8: ops union** if `src/types/ops.ts` enumerates `entity_kind`, add `'account'`.
- [ ] **Step 9: Tests** — extend the sync/materialize round-trip test (grep `tests/` for the budget/widget round-trip): an `account` create op → server D1 `accounts` row + client Dexie `accounts` row both have name/type/opening_balance/currency; an account update op (per-field LWW) changing only `name` leaves `opening_balance`; a money op with `account_id` round-trips both sides (array/JSON not relevant here — it's a plain string). Update any `MoneyEntryRow`/`MoneyPayload` literal in tests to include `account_id` (grep — build fails otherwise).
- [ ] **Step 10: Gate** `pnpm lint && pnpm typecheck && pnpm test sync materialize money account && pnpm build` → pass. **Step 11: Commit** named files.

---

### Task 2: pure balance + net-worth math

**Files:** Create `src/lib/accounts.ts`, `src/lib/accounts.test.ts`

**Interfaces (Produces):**
- `type AccountLike = { id: string; name: string; type: 'asset'|'liability'; opening_balance: number; currency: string; icon: string | null }`
- `accountBalance(account: AccountLike, entries: MoneyEntryRow[], toAcct: (e: MoneyEntryRow) => number): number` — `delta = Σ toAcct(e) with sign (+in / −out)` over entries with `account_id === account.id`; `asset → opening + delta`; `liability → opening − delta`. (`toAcct` converts an entry's amount to the account currency; caller supplies it; a skipped/0 conversion just contributes 0.)
- `type NetWorth = { net: number; assets: number; liabilities: number; perAccount: { id: string; name: string; type: 'asset'|'liability'; icon: string | null; balance: number }[] }`
- `netWorth(accounts: AccountLike[], entries: MoneyEntryRow[], toAcct, toPrimary: (amountInAcctCurrency: number, acctCurrency: string) => number): NetWorth` — per account compute `balance` (in acct currency) via `accountBalance`; `perAccount` sorted (assets then liabilities, by name); `assets = Σ toPrimary(asset.balance)`, `liabilities = Σ toPrimary(liability.balance)`, `net = assets − liabilities`.

- [ ] **Step 1: Failing tests** `accounts.test.ts` (use a money `row()` factory like other lib tests; `toAcct = e => e.amount`; `toPrimary = (n)=>n`):
  - asset: opening 500000, one out 20000, one in 5000 → 500000 − 20000 + 5000 = 485000.
  - liability: opening 200000, one out 50000 (spend) → 200000 − (−50000) = 250000; then an in 30000 (payment) → 220000.
  - account with no entries → exactly opening_balance.
  - entries with a different/null account_id are ignored.
  - `netWorth`: 1 asset (485000) + 1 liability (250000) → assets 485000, liabilities 250000, net 235000; perAccount length 2, sorted assets-first.
  - empty accounts → `{net:0,assets:0,liabilities:0,perAccount:[]}`.
- [ ] **Step 2: Run fail → implement `accounts.ts`** (pure; no mutation) → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test accounts` → pass. **Step 4: Commit** named files.

---

### Task 3: Settings → Accounts management page

**Files:**
- Create: `src/hooks/use-accounts.ts`, `src/hooks/use-archived-accounts.ts`, `src/app/settings/accounts/page.tsx`
- Modify: `src/app/settings/page.tsx` (add an "Accounts" link, mirroring the "Categories" link)

**Interfaces (Produces):**
- `useAccounts(userId): AccountRow[]` — non-deleted, non-archived, sorted (type asc then name) [mirror `use-categories`].
- `useArchivedAccounts(userId): AccountRow[]` — `is_archived===1 && !deleted_at` [mirror `use-archived-categories`].

- [ ] **Step 1: hooks** (mirror the categories hooks).
- [ ] **Step 2: page** `settings/accounts/page.tsx` (mirror `settings/categories/page.tsx`): auth shell; a create form (name + type select asset|liability + opening-balance amount input [parse to minor units, `parseAmountInput` from `@/lib/parse-amount`] + currency select `SUPPORTED_CURRENCIES` + optional icon); active list per row: inline Edit (name + icon + opening balance) → `account` update op; Archive → `{is_archived:1}`; an Archived section with Restore. All ops via `generateOp`+`applyLocalOp`+`pushPullOnce`. Empty state: "Add your first account." 44px targets, aria-labels.
- [ ] **Step 3: settings link** add a 44px "Accounts" entry in `settings/page.tsx` next to "Categories".
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm build` → pass (presentational). **Step 5: Commit** named files.

---

### Task 4: money ↔ account link (capture + display)

**Files:**
- Modify: `src/components/confirmation-chip.tsx`, `src/lib/blank-draft.ts`, `src/lib/manual-draft.ts`, `src/lib/entry-to-draft.ts`, `src/lib/undo-delete.ts`, `src/app/app/page.tsx`, `src/components/money-list.tsx`
- Test: adapt draft/entry-to-draft tests

**Interfaces:** money `ChipDraft` gains `account_id?: string | null`.

- [ ] **Step 1: chip** — add `account_id` to the money ChipDraft type; render an **account picker** (a `<select>` of `useAccounts(userId)` — "No account" + each account's `{icon} {name}`) in the money chip; wire to the draft.
- [ ] **Step 2: draft paths** — money branches of `blank-draft`/`manual-draft` (`account_id: null`), `entry-to-draft` `moneyRowToDraft` (copy `account_id`), `undo-delete` `resurrectPayload` money (include `account_id`).
- [ ] **Step 3: persist** — `app/page.tsx` `confirmEntry` + `updateEntry` money payloads include `account_id: final.account_id ?? null`.
- [ ] **Step 4: display** — `money-list.tsx`: when `account_id` set, resolve the account (via a resolver over `useAllCategories`-equivalent for accounts — use a `useAccounts`+archived map, or a `useAllAccounts`; simplest: a `useAccounts` map, fall back to "Unknown account" if not found because archived/deleted) and show a small account badge on the row. GUARD `account_id` undefined (legacy rows).
- [ ] **Step 5: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → pass. **Step 6: Commit** named files.

---

### Task 5: dashboard accounts widget (net worth)

**Files:**
- Create: `src/components/dashboard/accounts-widget.tsx`
- Modify: `src/lib/widgets.ts` (catalog + type), `src/components/dashboard/widget-card.tsx` (dispatcher)

**Interfaces:** `WidgetType` gains `'accounts'`; `WIDGET_CATALOG` gains an `accounts` entry.

- [ ] **Step 1: widgets.ts** — add `'accounts'` to `WidgetType` + a `WIDGET_CATALOG` entry (`{type:'accounts', label:'Accounts', description:'Net worth + account balances'}`). Do NOT add to `DEFAULT_WIDGET_TYPES` (users add it once they have accounts).
- [ ] **Step 2: `accounts-widget.tsx`** — `<AccountsWidget userId />`: `useAccounts` + `useMoneyEntries` + `useUserPrefs` + `useFxRates`; build `toAcct`/`toPrimary` FX fns (money-card pattern); `netWorth(...)`; render a net-worth headline (primary currency) + a per-account list (asset balances; liabilities shown as "owed"), each with icon+name+amount. Empty (no accounts) → a muted "Add accounts in Settings → Accounts" with a link. No `Date.now()` in render.
- [ ] **Step 3: dispatcher** — `widget-card.tsx`: add `type === 'accounts' → <AccountsWidget userId>`.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → pass. **Step 5: Commit** named files.

## Self-review

- **Coverage:** account entity both-sides + money link (T1, migration) · pure balance/net-worth math with the spec's sign conventions (T2) · Settings CRUD (T3) · capture + display on money (T4) · dashboard net-worth widget (T5). Transfers/filter/chart deferred per spec. ✓
- **Placeholders:** none — schema/fields/migration exact; pure math signatures + test cases explicit; UI steps name the mirror files.
- **Type consistency:** `AccountPayload`/`AccountRow`/`ACCOUNT_FIELDS` (T1) consumed by hooks/page (T3), math `AccountLike` (T2), widget (T5); `account_id` added to `MoneyPayload`/`MoneyEntryRow`/`ChipDraft` (T1/T4).
- **Legacy/empty guards:** `account_id` nullable + undefined-guarded on legacy money rows (T4); zero-accounts empty states (T3/T5); archived/deleted account reference → "Unknown account" (T4).

## Post-merge (owner)

Apply migration 0017 to remote D1 (accounts table + money_entries.account_id) via `wrangler … --remote --command` + verify with `pragma_table_info`. Then: Settings → Accounts → create your accounts (Cash, HDFC, the credit card as a liability with its current owed as opening balance), assign entries via the chip, add the Accounts widget to `/dashboard` to see net worth.
