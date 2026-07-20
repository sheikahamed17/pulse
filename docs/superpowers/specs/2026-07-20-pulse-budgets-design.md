# Pulse Budgets — Design Spec

**Date:** 2026-07-20
**Status:** Approved direction (per-category monthly limits; in-app progress + push alerts at 80% & 100%; UI + voice/text creation; Money-tab section). Ready for implementation plan.
**Scope:** Let the user set a monthly spending limit per category and track progress against it — glanceable in the Money tab, with push alerts when a category crosses 80% and 100% of its limit, plus natural-language creation ("set a budget for food 8000").

## Goal

Answer "am I on track this month?" per category. The user sets `Food = ₹8000/month`; Pulse shows month-to-date spend vs the limit with a progress bar (ok / warn ≥80% / over ≥100%), and pushes a notification the first time each category crosses 80% and 100% in a month.

## Architecture

A **standing per-category budget entity** (one row per category, not per-month), **client-computed progress** over local money data, a **daily cron** for push threshold alerts, and a new **`set_budget`** router intent + agent for voice/text creation.

- **Writes** (unlike the read-only Query feature): `budget` is a new `entity_kind` (the slot is already reserved in `src/types/ops.ts` but unimplemented), so it follows the full add-an-entity_kind playbook, **including the client `applyLocalOp` step** (the Learning/Notes durable lesson).
- **Progress** is derived, not stored: computed client-side from money entries at read time (reuses the FX conversion + category aggregation already proven in `query-money-exec.ts`). No server aggregation for the UI.
- **Alerts** run server-side on a cron (matches the shipped `due-tasks` pattern) with idempotent per-(category, month, threshold) notification rows.

**Rejected alternatives:** per-month budget rows (history) — YAGNI; on-money-log alerts (timelier, no cron) — couples budget logic into the hot sync path and is harder to make idempotent. The cron keeps the alert path isolated and reuses proven infra.

## Entity model — `budget`

Payload (`src/lib/op-schemas/budget.ts`, **no `.strict()`**, matching the money/task/etc. op-schema convention):

```ts
BudgetPayloadSchema = z.object({
  category_id: z.string().min(1),
  amount: z.number().int().positive(),   // minor units (e.g. paise/cents), in `currency`
  currency: z.enum(SUPPORTED_CURRENCIES),
})
```

- **`BUDGET_FIELDS = ['category_id', 'amount', 'currency']`** (envelope `id`/`created_at`/`updated_at`/`deleted_at` handled by sync + materialize, as with every other entity).
- **One budget per category (1:1):** the budget's **`entity_id` IS the `category_id`**. Setting a budget for a category is therefore an idempotent upsert (same id → per-field LWW), and the client join to progress is trivial (`budget.id === category.id`). A category with no budget row simply has no limit.
- **Spend categories only:** budgets target `category.kind === 'spend'` (income categories are not budgetable). The create UI and `parse_budget` agent only offer/resolve spend categories.

**Add-an-entity_kind checklist (all required — the client step is the easy miss):**
1. `src/lib/op-schemas/budget.ts` + register in `op-schemas/index.ts`.
2. `BUDGET_FIELDS` in `src/lib/entity-fields.ts`.
3. Dexie `BudgetRow` type + store, **schema v7** (`src/lib/dexie.ts`), indexed by `id` (= category_id).
4. D1 migration **`0008`** — `budgets` table (`id`, `user_id`, `category_id`, `amount`, `currency`, `created_at`, `updated_at`, `deleted_at`), applied to remote by hand (CI token lacks D1:Edit).
5. Kysely `BudgetTable` in the DB types.
6. Server `materializeRow` `case 'budget'` (`src/lib/materialize.ts`).
7. **Client `applyLocalOp` `case 'budget'`** + the `db.transaction([...])` table list (`src/lib/sync-client.ts`).

## Progress computation (client, pure)

`src/lib/budget-exec.ts`:

```ts
computeBudgetProgress(
  entries: MoneyEntryRow[],          // money rows; fn filters by direction/category/date
  budgets: BudgetRow[],
  monthStart: string,                // ISO, start of current calendar month in user tz
  now: string,
  toPrimary: (entry: MoneyEntryRow) => number,  // FX → budget/primary currency (existing machinery)
): BudgetProgress[]  // { categoryId, limit, spent, pct, state: 'ok'|'warn'|'over' }
```

- **Spend** = Σ `toPrimary(e)` for money where `direction==='out'`, `e.category_id === budget.category_id`, `occurred_at ∈ [monthStart, now)`, excluding tombstones.
- **state** = `over` if `spent/limit >= 1.0`, `warn` if `spent/limit >= 0.8`, else `ok` (computed from the raw ratio so the 80/100 boundaries are exact). `pct = round(spent/limit*100)` is for display only.
- **Month** = current calendar month in the user's primary tz (from `useUserPrefs().tz`, default `Asia/Kolkata`); resets on the 1st.
- **Currency:** budget `amount` is denominated in the user's primary currency (captured at creation). Month-to-date spend is FX-converted to primary via the existing `convertViaRates` and compared to `limit`. If the user later changes primary currency, existing budgets keep their original `currency` and are converted to the new primary for display.

## UI — Money-tab section

- A **Budgets section** within the Money tab (not a 5th dock tab, not settings) — a header/subview showing each budgeted category as a row: category name/icon, `spent / limit` (mono, tabular-nums), a proportional progress bar, and a state color (ok = accent, warn ≥80% = warning, over ≥100% = destructive). Glass conventions, `--accent-2`, lucide icons, focus-visible, ≥44px touch targets, aria.
- **Create/edit:** a sheet/subview — pick a spend category (excluding ones that already have a budget, for create), enter a monthly amount → writes a `budget` op. Edit changes the amount; remove deletes the budget op (tombstone). Keyboard-operable + labeled (matches the just-shipped list a11y pattern).
- **Empty state:** "No budgets yet — set one for a category or say 'set a budget for food 8000'."

## Voice/text — `set_budget` intent

- New router intent **`set_budget`** added to `INTENTS` and `ROUTER_SYSTEM_PROMPT`; revises the current `"set a budget for food" → chat` fallback so it now routes to `set_budget`. Because this **changes existing routing**, the build runs the project's **2-lens adversarial router verify** (set_budget vs log_money vs query_money vs chat collisions) + a regression assertion that all existing intents still classify.
- New **`parse_budget`** agent (`gpt-oss-120b`, Zod-clamped) → `{ category_name: string, amount: number, currency?: Currency }`. The route resolves `category_name` → an existing spend `category_id` (fuzzy/exact match over the user's categories; if no match, respond with a chat-style clarification rather than inventing a category), builds the budget op (`entity_id = category_id`), and returns it for the client to apply — mirroring how `log_*` flows produce a confirmation chip. Amount parsed in the user's primary currency unless a currency is stated.
- Disambiguation examples: `"set a budget for food 8000"`/`"budget 5000 for groceries"` → `set_budget`; `"how much did I spend on food"` → `query_money`; `"what's my food budget"` → NOT `set_budget` (no budget-query intent exists — routes to `query_money`/`chat`); `"spent 8000 on food"` → `log_money`.

## Alerts — daily cron

- New route **`/api/cron/budgets`** (`POST`, `isAuthorizedCron` / `Authorization: Bearer CRON_SECRET`), added to the cron dispatcher + a new daily **wrangler `[triggers]` cron** schedule.
- Per user with ≥1 budget: compute month-to-date spend per budgeted category server-side (Kysely sum over `money` in the current month, converted to primary), then for each threshold in `[80, 100]` where `pct >= threshold`, insert an **idempotent** `push_notifications` row keyed **`budget-{category_id}-{YYYY-MM}-{threshold}`** (dedup exactly like `due-tasks`), then `sendPushToUser`. One push per (category, month, threshold); the 1st and month boundary re-arm naturally via the date-keyed id.
- Notification copy: title `"Budget alert: {category} at {pct}%"`, body `"{spent} of {limit} this month"`, url `/app?tab=money`.

## Global constraints

- Stack unchanged (Next 16 / React 19 / Tailwind 4 / Dexie v4 / Kysely-D1 / Groq). **No new dependencies.** Dark glassmorphism conventions (glass, `--accent-2`, `font-mono` for figures, lucide, `focus-visible`, ≥44px, `role`/aria).
- Money amounts + budget amounts are **integer minor units**; currency from `SUPPORTED_CURRENCIES`; budgets are **spending only** (`direction:'out'`).
- Op-schema convention: **no `.strict()`** on `BudgetPayloadSchema` (matches money/task/learning/note); agent response schemas **do** use `.strict()` (matches `query-money-response` et al.).
- New entity ⇒ **both** server `materialize.ts` **and** client `sync-client.ts` `applyLocalOp` + txn list must be wired, with a client `applyLocalOp → db.budgets.get` round-trip test.
- Gate every task: `pnpm typecheck` + `pnpm lint` + `pnpm test` (baseline 665; grows; **run `pnpm test` UN-CHAINED**) + **`pnpm build`**. Git identity `sdsheikahamed@gmail.com`. Branch `feature/budgets`. D1 migration `0008` applied to remote by hand.

## Non-goals (YAGNI)

- No per-month budget history (no "what was my March Food budget"); budgets are standing config.
- No weekly/annual/custom periods, no rollover of unused budget, no income budgets.
- No dedicated budget *query* intent ("what's my food budget") — the Money-tab section is the surface; a future `query_budget` is a documented follow-up.
- No editing spend against a budget retroactively; progress always reflects current month-to-date.
- No per-device alert preferences / snoozing (thresholds fixed at 80/100).

## Testing & verification

- **Pure `computeBudgetProgress`** (unit): ok/warn/over thresholds at exact boundaries (79/80/100/101%), multi-currency spend (FX to primary), month-boundary inclusion/exclusion, category with no matching spend (0%), tombstoned money excluded, budget with no spend, over-100% clamping of the bar.
- **`budget` op-schema:** valid payload, rejects non-positive/non-int amount, unknown currency; `entity_id = category_id` upsert (per-field LWW) round-trips.
- **Client sync:** `applyLocalOp` `case 'budget'` writes to Dexie and a `db.budgets.get(category_id)` round-trip returns the row (the entity_kind lesson).
- **Cron `/api/cron/budgets`:** 403 without CRON_SECRET; inserts 80% + 100% rows when crossed; idempotent (re-run inserts nothing new); no alert below 80%; one `sendPushToUser` per distinct user; month-keyed id re-arms next month.
- **`parse_budget` agent (Groq-mocked):** representative utterances → valid `{category_name, amount, currency?}`; malformed output clamped/rejected; unresolved category → clarification (no invented category).
- **Router:** regression (all existing intents still classify) + the adversarial `set_budget` verify.
- **Gate:** typecheck + lint + test (grows) + `pnpm build`.
- **Manual (deployed PWA):** set a budget via UI and via "set a budget for food 8000"; log spend to cross 80% then 100%; confirm bar/state + (after the cron runs) the push; a normal `log_money`/`query_money` still routes correctly.

## Risks & mitigations

- **Router regression** (`set_budget` revises the `"set a budget"→chat` fallback and neighbors `log_money`/`query_money`) → adversarial 2-lens verify + regression test; the confirmation chip is dismissible so a misroute is low-harm.
- **Entity_kind client step missed** (the recurring Learning/Notes trap) → explicit checklist above + a mandatory client `applyLocalOp` round-trip test; the whole-branch review is the backstop.
- **Alert spam / missed alerts** → deterministic per-(category, month, threshold) notification id makes each fire exactly once and re-arm monthly; daily cadence bounds lateness to ≤1 day (documented; on-log alerts are the future upgrade).
- **Multi-currency / primary-currency change** → budget carries its own `currency`; progress converts via the proven `convertViaRates`; documented behavior when primary changes.
- **1:1 id coupling** (budget.id = category_id) → if a category is deleted, its budget is orphaned; acceptable (it stops displaying), and category deletion is rare.
