# Cash-flow forecast / upcoming — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A forward-looking cash-flow view — the next scheduled money events (from recurring rules) + a projected month-end net — surfaced as a dashboard widget.

**Architecture:** PURE client read layer over existing `recurring_rules` + `money_entries`. No migration, no new entity, no sync change. Expand each active recurring MONEY rule's upcoming occurrences via the existing `computeNextDue`/`checkEndConditions`; combine with this-month actuals for the projection; render a new dashboard `upcoming` widget (reuses the widget system).

## v1 scope + non-goals

- v1 = **upcoming recurring events (next 30 days)** + **projected month-end cash flow** (this month: actual net so far + scheduled remaining → projected net). Works WITHOUT accounts (money entries + recurring rules only) → immediately useful.
- **Deferred (noted):** projected month-end *balance/net-worth* using account balances; budget-based discretionary-spend estimate; a dedicated full-page forecast. (The projection headline is cash-flow net, not a balance projection.)

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (`new Date().getTime()` in a memo/handler).
- Client-only; NO migration/entity/sync change. Reuse `computeNextDue`/`checkEndConditions` (`src/lib/recurring.ts`), `useRecurringRules`, `useMoneyEntries`, `useUserPrefs`, `useFxRates`, `useAllCategories`, `convertViaRates`, `currencySymbol`, the widgets system (`src/lib/widgets.ts` + `widget-card.tsx`).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app` + `/dashboard` 200. Whole-branch opus review (forecast math + occurrence loop + FX).

## Background (verified)

- `src/lib/recurring.ts`: `computeNextDue(rule): string` (next ISO after `rule.next_due_at`, DOM-clamped for monthly/yearly); `checkEndConditions(rule): { is_active }` (never/until/count). `RecurringRule` needs `{id, period, interval_count, anchor_at, next_due_at, occurrences_so_far, end_condition_kind, end_until, end_count, is_active}` — all present on `RecurringRuleRow` (which also has amount/currency/direction/category_id/description/deleted_at).
- `useRecurringRules(userId)` hook exists (`src/hooks/use-recurring-rules.ts`).
- Widget system: `WidgetType`/`WIDGET_CATALOG` in `src/lib/widgets.ts`; dispatcher `src/components/dashboard/widget-card.tsx`; money-card FX/`toPrimary` pattern in `src/components/money-card.tsx`.

---

### Task 1: pure forecast lib

**Files:** Create `src/lib/forecast.ts`, `src/lib/forecast.test.ts`

**Interfaces (Produces):**
- `type ForecastEvent = { ruleId: string; date: string; amount: number; currency: string; direction: 'out' | 'in'; category_id: string | null; description: string | null }`
- `upcomingOccurrences(rules: RecurringRuleRow[], fromIso: string, toIso: string): ForecastEvent[]` — for each rule with `is_active === 1 && !deleted_at`, walk occurrences starting at `next_due_at`:
  - maintain a mutable cursor rule `{ ...rule, next_due_at: cursorDate, occurrences_so_far: n }`; loop: if `checkEndConditions(cursor).is_active === 0` → stop; if `cursor.next_due_at >= toIso` → stop; if `cursor.next_due_at >= fromIso` → emit a `ForecastEvent` (amount/currency/direction/category_id/description from the rule); advance `cursorDate = computeNextDue(cursor)`, `occurrences_so_far++`.
  - **Safety cap:** max 500 iterations per rule (break + stop) to guard against a pathological rule (e.g. a daily rule whose next_due is far in the past).
  - Return all events across rules sorted by `date` asc.
- `type ForecastSummary = { actualIn: number; actualOut: number; actualNet: number; scheduledIn: number; scheduledOut: number; projectedNet: number }`
- `forecastSummary(currentMonthEntries: MoneyEntryRow[], scheduledThisMonth: ForecastEvent[], toPrimary: (amt: number, currency: string) => number): ForecastSummary` — `actualIn/actualOut` = Σ toPrimary over entries by direction; `scheduledIn/scheduledOut` = Σ toPrimary over the scheduled events by direction; `actualNet = actualIn − actualOut`; `projectedNet = (actualIn + scheduledIn) − (actualOut + scheduledOut)`. Pure; no mutation of inputs.

- [ ] **Step 1: Failing tests** `forecast.test.ts` (a `rule()` factory for `RecurringRuleRow` + a money `row()` factory; `toPrimary = (a) => a`):
  - a monthly rule (next_due mid-horizon) emits exactly the occurrences within [from,to) (e.g. a monthly rule over a 90-day window → ~3 events, dates stepped by computeNextDue).
  - a weekly rule over 30 days → ~4–5 events, all dates in-window, sorted.
  - `is_active===0` / `deleted_at` rule → no events.
  - `end_count`: a rule with `end_count=2, occurrences_so_far=1` emits at most 1 more, then stops.
  - `end_until`: stops at the until date.
  - occurrences before `fromIso` are NOT emitted (overdue already-materialized).
  - `forecastSummary`: actual (this-month entries) + scheduled → projectedNet math; empty → zeros.
  - (safety) a daily rule with next_due 2 years ago + a 30-day window returns a bounded list (≤ the cap) without hanging.
- [ ] **Step 2: Run fail → implement `forecast.ts`** → pass. Import `computeNextDue`/`checkEndConditions` from `@/lib/recurring`; types from `@/lib/dexie`.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test forecast` → pass. **Step 4: Commit** named files.

---

### Task 2: `upcoming` dashboard widget

**Files:** Create `src/components/dashboard/upcoming-widget.tsx`

**Interfaces (Consumes Task 1).**

- [ ] **Step 1: `<UpcomingWidget userId />`** —
  - Hooks: `useRecurringRules(userId)`, `useMoneyEntries(userId)`, `useUserPrefs()`, `useFxRates([...SUPPORTED_CURRENCIES])`, `useAllCategories(userId)` (→ a resolver for category names, via `makeCategoryResolver`).
  - `const nowMs = useMemo(() => new Date().getTime(), [])`. Horizon: `fromIso = new Date(nowMs).toISOString()`, `toIso = new Date(nowMs + 30*24*60*60*1000).toISOString()`. This-month bounds: reuse `analyticsPeriods(nowMs,'month',1)[0]` OR `monthBounds` (`@/lib/money-filter-sort`) → `{from,to}`.
  - `toPrimary(amt, currency)` = money-card pattern (`convertViaRates` to `prefs.primary_currency`, fallback: return amt unconverted or 0 — mirror money-card; use a reference date of `nowIso` for the scheduled/aggregate conversion).
  - `upcoming = upcomingOccurrences(rules, fromIso, toIso)` (memoized); `scheduledThisMonth = upcoming.filter(e => e.date < monthTo)`; `currentMonthEntries = entries.filter(in month bounds, non-deleted)`; `summary = forecastSummary(currentMonthEntries, scheduledThisMonth, toPrimary)`.
  - Render: a **"Projected this month (net)"** headline = `summary.projectedNet` (primary symbol, ÷100/JPY÷1), with a small sub-line "actual {actualNet} · scheduled {scheduledIn−scheduledOut}". Then an **Upcoming** list of the next ~5 `upcoming` events: date (`formatLocalDate`/`EntryTimestamp`-style), a direction glyph (↑ in / ↓ out), amount, and category name (via the resolver) or description.
  - Empty state (no upcoming events / no active recurring money rules) → muted "Set up recurring money entries to see your forecast."
  - No `Date.now()` in render body.
- [ ] **Step 2: Gate** `pnpm lint && pnpm typecheck && pnpm build` → pass (presentational). **Step 3: Commit** named file.

---

### Task 3: catalog + dispatcher

**Files:** Modify `src/lib/widgets.ts`, `src/components/dashboard/widget-card.tsx`

- [ ] **Step 1: widgets.ts** — add `'upcoming'` to `WidgetType` + a `WIDGET_CATALOG` entry `{ type:'upcoming', label:'Upcoming', description:'Cash-flow forecast: upcoming recurring events + projected month-end' }`. Do NOT add to `DEFAULT_WIDGET_TYPES`.
- [ ] **Step 2: dispatcher** — `widget-card.tsx`: add `if (type === 'upcoming') return <section …><UpcomingWidget userId={userId} /></section>` (mirror the other cases).
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (full suite + build). **Step 4: Commit** named files.

## Self-review

- **Coverage:** upcoming recurring events (T1 `upcomingOccurrences` + T2 list) · projected month-end cash flow (T1 `forecastSummary` + T2 headline) · dashboard surface (T2 widget + T3 catalog/dispatcher). Balance-projection + budgets deferred per scope. ✓
- **Placeholders:** none — pure signatures + test cases explicit; widget wiring names the hooks/patterns.
- **Type consistency:** `ForecastEvent`/`ForecastSummary` (T1) consumed by the widget (T2); `WidgetType 'upcoming'` (T3) consumed by the dispatcher (T3).
- **Guards:** occurrence loop has a 500-iter safety cap; empty/no-rules → empty state; FX missing-rate fallback mirrors money-card; legacy money rows (no account_id etc.) irrelevant here (forecast reads amount/direction/occurred_at only).

## Post-merge

Verify prod `/app` + `/dashboard` 200. Owner: add the "Upcoming" widget on `/dashboard`; make salary + rent recurring rules (they're the ideal inputs) to see a real forecast.
