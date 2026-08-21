# Savings goals — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Set savings targets and track progress. A goal is **either account-linked** (progress = a chosen asset account's balance vs target, auto from entries) **or manual** (a `saved_amount` you update). Managed in Settings → Goals; surfaced as a dashboard `goals` widget.

**Architecture:** New persisted `entity_kind: 'goal'` (mirrors the just-shipped **account** entity — both-sides sync + a Dexie version bump + migration). Progress is DERIVED (pure), never stored. No money-column change (goals link to an account via `goal.account_id`, not per money entry).

## Design decisions (resolved)

- **Tracking:** both modes. `goal.account_id` set → progress from `accountBalance(account)`; else manual `goal.saved_amount`.
- Account-linked goals should link an **asset** account (savings), and the goal's `currency` should match the linked account's currency (the create UI defaults goal.currency to the account's when linking; cross-currency is approximate — noted).
- v1 progress = current / target → pct (clamped 0–100) + remaining. **Deferred:** target-date pacing / "on track?" needed-per-month; contribution history; multi-currency exactness.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo.
- New `entity_kind 'goal'` requires ALL of (mirror `account`): `op-schemas/goal.ts`, `GOAL_FIELDS` (`entity-fields.ts`), Dexie `GoalRow` + **`this.version(11).stores({ goals: 'id, user_id' })`** + `resetDb` clear, `db.ts` type, `materialize.ts` case, `sync-client.ts` applyLocalOp case + the Dexie transaction table list, ops-union if present. Round-trip test BOTH sides.
- Migration (goals table) applied to remote D1 MANUALLY post-merge — **DDL one statement at a time** (`node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "<one stmt>"`); the Deploy workflow only auto-applies 0001–0004.
- Amounts minor units (÷100 display, JPY÷1); reuse `convertViaRates`/`currencySymbol`/`SUPPORTED_CURRENCIES`, `accountBalance` (`src/lib/accounts.ts`), `useAccounts`, the categories/accounts-page + widgets patterns.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/dashboard`, `/settings/goals` 200. **Whole-branch opus review** (new entity_kind + migration + sync-core): check both-sides persistence, legacy/empty guards, the linked-vs-manual progress, and archived/deleted linked-account handling.

## Reference (mirror exactly)

- **Account entity** (just shipped, the mirror): `src/lib/op-schemas/account.ts`, `ACCOUNT_FIELDS`, `materialize.ts` `case 'account'`, `sync-client.ts` `case 'account'` + txn list, `AccountRow` + `this.version(10).stores({accounts:…})`, `db.ts` accounts, migration `0017_accounts.sql`, `src/app/settings/accounts/page.tsx`, `src/hooks/use-accounts.ts`/`use-archived-accounts.ts`/`use-all-accounts.ts`.
- `accountBalance(account, entries, toAcct)` in `src/lib/accounts.ts`.
- Widgets: `WidgetType`/`WIDGET_CATALOG` (`src/lib/widgets.ts`) + `widget-card.tsx` dispatcher.

---

### Task 1: `goal` entity data model (both sides)

**Files:**
- Create: `migrations/0018_goals.sql`, `src/lib/op-schemas/goal.ts`
- Modify: `src/lib/entity-fields.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`, `src/lib/materialize.ts`, `src/lib/sync-client.ts`, `src/types/ops.ts` (if entity_kind is a union — grep)
- Test: extend the sync/materialize round-trip tests

**Interfaces (Produces):**
- `AccountPayloadSchema`-style `GoalPayloadSchema`: `name` (1–40), `target_amount` (int ≥0), `currency` (enum), `icon` (≤8 nullable optional), `account_id` (string min1 nullable optional), `saved_amount` (int ≥0 optional), `target_date` (string nullable optional), `is_archived` (0|1 optional). `GoalPayload` type.
- `GoalRow` (dexie): `{ id, user_id, name, target_amount:number, currency:string, icon:string|null, account_id:string|null, saved_amount:number, target_date:string|null, is_archived:number, field_hlcs, deleted_at, created_at, updated_at }`.
- `GOAL_FIELDS = ['name','target_amount','currency','icon','account_id','saved_amount','target_date','is_archived'] as const`.

- [ ] **Step 1: Migration** `migrations/0018_goals.sql`:
```sql
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  icon TEXT,
  account_id TEXT,
  saved_amount INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
```
(One migration file; when applying to remote D1 later, run the CREATE TABLE and the CREATE INDEX as SEPARATE `--command`s.)
- [ ] **Step 2: op-schema** `src/lib/op-schemas/goal.ts` (mirror `account.ts`).
- [ ] **Step 3: entity-fields** add `GOAL_FIELDS`.
- [ ] **Step 4: Dexie** `dexie.ts`: `GoalRow`; `goals!: EntityTable<GoalRow,'id'>`; `this.version(11).stores({ goals: 'id, user_id' })`; `db.goals.clear()` in `resetDb`.
- [ ] **Step 5: db.ts** Kysely `goals` table interface.
- [ ] **Step 6: materialize** `case 'goal': return materializeRow_LWW(db, op, userId, 'goals', GOAL_FIELDS)` (add `'goals'` to the tableName union type).
- [ ] **Step 7: sync-client** `case 'goal'` (get→applyOp→put) + add `db.goals` to the transaction table list.
- [ ] **Step 8: ops union** add `'goal'` if enumerated.
- [ ] **Step 9: Tests** — round-trip: a `goal` create op → server D1 `goals` row + client Dexie `goals` row both carry name/target_amount/currency/account_id/saved_amount; an update op (per-field LWW) changing only `saved_amount` leaves `target_amount`. Update any test literal that must typecheck.
- [ ] **Step 10: Gate** `pnpm lint && pnpm typecheck && pnpm test sync materialize goal && pnpm build` → pass. **Step 11: Commit** named files.

---

### Task 2: pure `goalProgress`

**Files:** Create `src/lib/goals.ts`, `src/lib/goals.test.ts`

**Interfaces (Produces):**
- `type GoalLike = { id: string; name: string; target_amount: number; currency: string; icon: string | null; account_id: string | null; saved_amount: number; target_date: string | null }`
- `type GoalProgress = { current: number; pct: number; remaining: number }`
- `goalProgress(goal: GoalLike, accounts: AccountLike[], entries: MoneyEntryRow[], toAcct: (e: MoneyEntryRow) => number): GoalProgress` — if `goal.account_id` and a matching account exists in `accounts` → `current = accountBalance(thatAccount, entries, toAcct)`; else `current = goal.saved_amount`. `pct = goal.target_amount > 0 ? clamp((current / goal.target_amount) * 100, 0, 100) : 0`; `remaining = Math.max(0, goal.target_amount − current)`. Pure. (If `account_id` set but the account isn't in `accounts` — archived/deleted — fall back to `saved_amount` OR treat current as 0; choose `saved_amount` fallback and document it.)

- [ ] **Step 1: Failing tests** `goals.test.ts` (reuse an account `AccountLike` + money `row()` factory; `toAcct = e => e.amount`):
  - manual goal (account_id null, saved_amount 30000, target 50000) → current 30000, pct 60, remaining 20000.
  - account-linked goal → current = accountBalance(linked, entries) (e.g. opening 40000 + an in 10000 → 50000; target 50000 → pct 100, remaining 0).
  - pct clamps at 100 when current > target; target 0 → pct 0 (no divide-by-zero).
  - account_id set but account not in `accounts` (archived/deleted) → falls back to saved_amount.
- [ ] **Step 2: Run fail → implement `goals.ts`** (import `accountBalance`/`AccountLike` from `@/lib/accounts`) → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test goals` → pass. **Step 4: Commit** named files.

---

### Task 3: Settings → Goals management page

**Files:**
- Create: `src/hooks/use-goals.ts`, `src/hooks/use-archived-goals.ts`, `src/app/settings/goals/page.tsx`
- Modify: `src/app/settings/page.tsx` (add a "Goals" link next to "Accounts")

**Interfaces:** `useGoals(userId): GoalRow[]` (non-deleted, non-archived, sorted by name); `useArchivedGoals(userId)` (`is_archived===1 && !deleted_at`). Mirror the accounts hooks.

- [ ] **Step 1: hooks** (mirror `use-accounts`/`use-archived-accounts`).
- [ ] **Step 2: page** `settings/goals/page.tsx` (mirror `settings/accounts/page.tsx`): auth shell; create form — name, target amount (`parseAmountInput` → minor units), currency select, optional icon, an optional **link-account** `<select>` (from `useAccounts(userId)` filtered to `type==='asset'` — "Not linked" + each asset account; linking defaults the goal currency to the account's), and when NOT linked a "saved so far" amount input. Active list per row: show name + target + a compact progress (reuse `goalProgress` with `useAccounts`+`useMoneyEntries` — or just show target for now and full progress in the widget; MINIMUM: show target + linked-account name / saved amount). Inline Edit (name, icon, target, and saved_amount when manual / linked-account when linked); Archive → `{is_archived:1}`; Archived section + Restore. All ops via generateOp+applyLocalOp+pushPullOnce. Empty state "Add your first goal." 44px + aria-labels.
- [ ] **Step 3: settings link** add a 44px "Goals" entry in `settings/page.tsx`.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm build` → pass (presentational). **Step 5: Commit** named files.

---

### Task 4: dashboard `goals` widget

**Files:**
- Create: `src/components/dashboard/goals-widget.tsx`
- Modify: `src/lib/widgets.ts` (catalog + type), `src/components/dashboard/widget-card.tsx` (dispatcher)

- [ ] **Step 1: widgets.ts** — add `'goals'` to `WidgetType` + a `WIDGET_CATALOG` entry `{ type:'goals', label:'Goals', description:'Savings goals + progress' }`. NOT in `DEFAULT_WIDGET_TYPES`.
- [ ] **Step 2: `goals-widget.tsx`** — `<GoalsWidget userId />`: `useGoals`, `useAccounts`, `useMoneyEntries`, `useUserPrefs`, `useFxRates`; build `toAcct` (mirror accounts-widget). For each goal, `goalProgress(goal, accounts, entries, toAcct)` → render name + a progress bar (pct) + `{current}/{target}` (goal.currency symbol, ÷100/JPY÷1) + remaining. Empty (no goals) → muted "Add goals in Settings → Goals" (a `<Link href="/settings/goals">`). No `Date.now()` in render.
- [ ] **Step 3: dispatcher** — `widget-card.tsx`: `if (type === 'goals') return <section …><GoalsWidget userId={userId} /></section>`.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green. **Step 5: Commit** named files.

## Self-review

- **Coverage:** goal entity both-sides + migration (T1) · pure progress math linked/manual (T2) · Settings CRUD (T3) · dashboard widget (T4). Target-date pacing deferred. ✓
- **Placeholders:** none — schema/fields/migration exact; math signature + tests explicit; UI mirrors named pages.
- **Type consistency:** `GoalPayload`/`GoalRow`/`GOAL_FIELDS` (T1) consumed by hooks/page (T3), math `GoalLike` (T2), widget (T4).
- **Guards:** account-linked-but-missing-account → saved_amount fallback (T2); target 0 → pct 0 (no NaN); zero goals → empty states; legacy irrelevant (new table).

## Post-merge (owner)

Apply migration 0018 to remote D1 (goals CREATE TABLE + index — as SEPARATE `--command`s) + verify with `pragma_table_info`. Then Settings → Goals → add a goal (e.g. "Emergency fund ₹50k" linked to a savings account, or manual) → add the Goals widget on /dashboard.
