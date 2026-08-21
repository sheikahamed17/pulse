# Bill reminders — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Push a reminder before a recurring bill is due (e.g. "₹15,000 rent due in 3 days"). Reuses the recurring rules, the forecast lib (`upcomingOccurrences`), and the existing push system; rides an existing cron tick (the 5-cron cap is full).

**Architecture:** A new `/api/cron/bill-reminders` route (mirrors `/api/cron/budgets`) runs on the daily `0 3 * * *` tick via **CRON_SECONDARY** (NOT a new trigger — Cloudflare caps crons at 5, already used). For each user's active recurring MONEY-out rules, it finds occurrences due within a fixed lead window, and sends ONE push per occurrence (deduped by a deterministic `push_notifications` id). No migration, no new entity.

## v1 scope + non-goals

- v1 = ONE reminder per bill occurrence, fired when it first enters a fixed **3-day** lead window; direction `out` recurring rules only; reaches push-subscribed users (push is already opt-in). In-app inbox row + a web-push.
- **Deferred (noted):** a per-user on/off toggle + configurable lead time (a user_prefs pref + Settings UI); income "money in" reminders; per-rule reminder settings.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (server route uses `new Date()` freely).
- **DO NOT add a 6th cron trigger** — `CRON_DISPATCH` must stay ≤5 (guard test `tests/cron-dispatch.test.ts`). Bill reminders ride `0 3 * * *` via `CRON_SECONDARY`.
- Reuse: `upcomingOccurrences`/`ForecastEvent` (`src/lib/forecast.ts`), `sendPushToUser` (`src/lib/web-push`), `isAuthorizedCron` (`src/lib/cron-auth`), `push_notifications` table, `convertViaRates`/`parseFxOverrides`, the `/api/cron/budgets` route shape.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app` 200 + `/api/cron/bill-reminders` unauth → 403.

## Background (verified)

- `src/lib/cron-dispatch.ts`: `CRON_DISPATCH` (5 entries, at cap) + `CRON_SECONDARY = { '0 3 * * *': ['/api/cron/budgets'] }`. `worker.ts` runs primary + secondary routes for a tick.
- `src/app/api/cron/budgets/route.ts`: the mirror — cron-auth, group by user, per-user compute, dedup a `push_notifications` row by a deterministic `id` (skip if exists), insert, `sendPushToUser` per user at the end.
- `src/lib/forecast.ts`: `upcomingOccurrences(rules, fromIso, toIso): ForecastEvent[]` — events (with `ruleId, date, amount, currency, direction, category_id, description`) for active non-deleted rules in [from,to), computeNextDue-stepped, 500-cap.
- `recurring_rules` (D1 + Dexie): `{ id, user_id, amount, currency, direction:'out'|'in', category_id, description, period, interval_count, anchor_at, next_due_at, end_*, occurrences_so_far, is_active, deleted_at, … }`.
- `push_notifications`: `{ id, user_id, title, body, url, created_at, read_at }`.

---

### Task 1: pure `buildBillReminders`

**Files:** Create `src/lib/bill-reminders.ts`, `src/lib/bill-reminders.test.ts`

**Interfaces (Produces):**
- `type BillReminder = { id: string; ruleId: string; dueDate: string; title: string; body: string; url: string }`
- `LEAD_DAYS = 3` (exported const).
- `buildBillReminders(outEvents: ForecastEvent[], nowIso: string, primaryCurrency: string, toPrimary: (amount: number, currency: string) => number): BillReminder[]` — for each event (caller passes ONLY direction-'out' events already within the lead window):
  - `dueDate = event.date.slice(0,10)` (YYYY-MM-DD, UTC day).
  - `id = ` `` `bill-${event.ruleId}-${dueDate}` `` (dedup key — one reminder per rule-occurrence).
  - `daysUntil = ` floor difference in whole UTC days between `dueDate` and `nowIso`'s day (0 = today, 1 = tomorrow, …; clamp ≥0).
  - `when = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : ` `` `in ${daysUntil} days` `` .
  - amount display: `toPrimary(event.amount, event.currency)` then format with the PRIMARY currency (÷100, JPY÷1) + `currencySymbol(primaryCurrency)` — reuse `@/lib/currency`. (Reminders show the primary-currency value so they're comparable.)
  - `title = ` `` `Bill due ${when}` `` ; `body = ` `` `${symbol}${amountMajor} ${event.description ?? 'recurring bill'}` `` ; `url = '/app?tab=money'`.
  - Return one BillReminder per event. Pure; no mutation.

- [ ] **Step 1: Failing tests** `bill-reminders.test.ts` (build `ForecastEvent` literals; `toPrimary = (a) => a`):
  - an event due today → `when` "today", id `bill-{ruleId}-{date}`, body has the amount + description.
  - due tomorrow → "tomorrow"; due in 3 days → "in 3 days".
  - two events same rule different dates → two distinct ids; same rule same date → same id (dedup).
  - amount formatting: 1500000 (₹15,000) → body contains "₹15,000" (INR); a JPY event → ÷1.
- [ ] **Step 2: Run fail → implement `bill-reminders.ts`** (import `ForecastEvent` from `@/lib/forecast`, `currencySymbol` from `@/lib/currency`) → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test bill-reminders` → pass. **Step 4: Commit** named files.

---

### Task 2: `/api/cron/bill-reminders` route + CRON_SECONDARY wiring

**Files:**
- Create: `src/app/api/cron/bill-reminders/route.ts`
- Modify: `src/lib/cron-dispatch.ts`
- Test: `src/app/api/cron/bill-reminders` route test (mirror `tests/api/cron-budgets-route.test.ts` if present — grep) + confirm `tests/cron-dispatch.test.ts` stays green

- [ ] **Step 1: Route** `src/app/api/cron/bill-reminders/route.ts` — mirror `/api/cron/budgets`:
  - `isAuthorizedCron(req, cfEnv)` → 403 if not.
  - `now = new Date().toISOString()`; `LEAD` window `toIso = new Date(Date.now() + LEAD_DAYS*86400000).toISOString()` (server-side; a bare `new Date()`/`Date.now()` is FINE in a route handler — the react-hooks/purity rule is client-render-only).
  - Load active out-rules: `db.selectFrom('recurring_rules').where('is_active','=',1).where('deleted_at','is',null).where('direction','=','out').selectAll().execute()`. Group by `user_id`.
  - Load `fx_rates` once (like budgets). For each user: load prefs (primary currency, tz, fx_overrides); `toPrimary(amount, currency)` via `convertViaRates` (fallback to amount). Compute `events = upcomingOccurrences(userRules, now, toIso)` then keep `direction === 'out'` (they already are) → `reminders = buildBillReminders(events, now, primary, toPrimary)`.
  - For each reminder: dedup-check `push_notifications` by `reminder.id` (skip if exists); else insert `{ id, user_id, title, body, url, created_at: now, read_at: null }`; mark user to push.
  - After the loop, `sendPushToUser` per marked user (try/catch, like budgets).
  - Response `{ reminders_created, users_pushed }`.
- [ ] **Step 2: Wire CRON_SECONDARY** — `src/lib/cron-dispatch.ts`: change `'0 3 * * *': ['/api/cron/budgets']` → `['/api/cron/budgets', '/api/cron/bill-reminders']`. (CRON_DISPATCH untouched → still 5; the guard test passes.) Update the comment to mention bill reminders ride the daily tick after FX.
- [ ] **Step 3: Tests** — a route test (mirror the budgets route test's fake-DB harness): 403 without cron auth; creates a reminder for an out-rule due within the lead window; DEDUP (a second run with the notif id present creates nothing); no reminder for an out-rule due AFTER the lead window or for an income rule; calls sendPushToUser for users with new reminders. Confirm `tests/cron-dispatch.test.ts` (the ≤5 guard + secondary resolution) still passes — add an assertion that `resolveSecondaryCronRoutes('0 3 * * *')` includes `/api/cron/bill-reminders`.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test bill-reminders cron && pnpm build` → all green. **Step 5: Commit** named files.

## Self-review

- **Coverage:** bill reminders computed (T1 pure) + delivered on a daily tick via CRON_SECONDARY with dedup + push (T2), reusing forecast + push. Cap respected (CRON_DISPATCH stays 5). ✓
- **Placeholders:** none — pure signature + test cases explicit; route mirrors budgets with the exact queries.
- **Type consistency:** `BillReminder`/`LEAD_DAYS` (T1) consumed by the route (T2); `ForecastEvent` reused from forecast.ts.
- **Cap safety:** only CRON_SECONDARY changes; CRON_DISPATCH untouched; the guard test asserts ≤5.

## Post-merge

Verify prod `/app` 200 + `/api/cron/bill-reminders` unauth → 403. The reminder fires on the next `0 3 UTC` tick for any push-subscribed user with a recurring OUT rule due within 3 days. Owner: make rent (and other bills) recurring OUT rules + ensure push is enabled (Settings) → confirm a reminder lands. (Follow-up: a per-user toggle + configurable lead in Preferences.)
