# Manual FX Override — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review → implementation plan
**Feature:** Let the user set a manual exchange rate for a currency, used to convert to their primary currency **only when the ECB daily feed has no rate** for that currency (fill-the-gap).

## Problem

Money amounts convert to the primary currency by EUR-triangulation using daily ECB rates (`fx_rates` table, cron-fetched). ECB's daily reference feed does **not** cover every currency — notably **AED** (UAE Dirham) is absent — so AED (and any other uncovered currency) amounts convert to nothing (`convertViaRates`/`convertToPrimary` return `null`). The user needs a way to supply a rate for such currencies.

## Goal

A per-user, per-currency manual rate (expressed as **"1 EUR = N currency"**, matching ECB/`fx_rates` semantics) that fills the missing EUR→currency leg. **ECB always wins when it has a rate**; the manual rate is consulted only on an ECB miss.

## Global Constraints

- No new dependencies, **no new entity_kind**. Reuse `user_prefs` (already read client-side via `useUserPrefs` and server-side by the budgets cron) as the home for the override map.
- Do NOT change the working ECB path. The override is a fallback consulted only when the freshest ECB rate for a target is `null`.
- One small D1 migration: `ALTER TABLE user_prefs ADD COLUMN fx_overrides TEXT` (JSON; nullable; applied to remote via `wrangler d1 execute pulse --remote --command`, before deploy — backward-compatible).
- Rates expressed as EUR→currency (1 EUR = N currency), currency limited to `SUPPORTED_CURRENCIES` (the 9). Managed in Settings → Preferences.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Terse, code-first. Gate UN-CHAINED before finishing.

## Architecture

### A. Storage — `user_prefs.fx_overrides`
- D1 `user_prefs` gains `fx_overrides TEXT` (JSON `Record<string, number>`, currency → EUR-rate). Kysely `UserPrefsTable` gains `fx_overrides: string | null`.
- `GET /api/user-prefs` returns a parsed `fx_overrides: Record<string, number>` (parse the JSON column; default `{}`). `PUT /api/user-prefs` accepts + JSON-stringifies it (validate: keys ∈ SUPPORTED_CURRENCIES, values finite positive numbers; drop invalid).
- `UserPrefs` type (`use-user-prefs.ts`) gains `fx_overrides: Record<string, number>` (default `{}`); `fetchPrefs`/`savePrefs`/the cache carry it.

### B. Converter fill-the-gap fallback
- `convertViaRates(amount, currency, primary, occurredAt, rates, overrides?: Record<string, number>)`: in the internal `freshest(target)`, when no ECB row is found for `target` (and target ≠ EUR), if `overrides?.[target]` is a positive finite number, return `{ date: '(manual)', rate: overrides[target] }`; else `null` (unchanged). The `'(manual)'` sentinel date is only used for the disclosed `rateDate` and the older-of-two comparison (a manual leg reads as the oldest → the other leg's date is disclosed when present; acceptable).
- `convertToPrimary(db, amount, currency, primary, occurredAt, overrides?)`: same fallback after `freshestRate` returns `null`.
- Fill-the-gap invariant: overrides are consulted ONLY on an ECB miss, so an ECB rate always takes precedence.

### C. Threading
Pass the user's overrides at every conversion call site:
- Client (`prefs.fx_overrides ?? {}` from `useUserPrefs`): `money-card.tsx` (4 calls), `money-list.tsx`, `budget-section.tsx`, `query-answer-card.tsx` (2 calls).
- Server budgets cron (`src/app/api/cron/budgets/route.ts`): it already loads `user_prefs` per user for `primary` — read `fx_overrides` from that row (parse JSON) and pass to `convertViaRates`.
- `convertToPrimary` server callers (if any beyond tests): pass overrides where a user's prefs are in scope; else omit (defaults to no override).

### D. UI — Settings → Preferences
A "Manual exchange rates" section on the existing preferences page:
- Lists current overrides: `1 EUR = <rate> <currency>` with a remove (×).
- An add-row: a currency `<select>` (SUPPORTED_CURRENCIES) + a numeric rate input + Add.
- Edits update local state; the existing Save persists via `savePrefs` (now including `fx_overrides`). A short helper line: "Used only when the daily ECB feed has no rate for a currency (e.g. AED)."

### Data Flow

```
Settings → add "AED, 1 EUR = 3.95" → savePrefs({ ...prefs, fx_overrides: { AED: 3.95 } })
  → PUT /api/user-prefs (JSON.stringify fx_overrides) → user_prefs.fx_overrides

money-card converting an AED entry to INR:
  convertViaRates(amount, 'AED', 'INR', occurredAt, rates, prefs.fx_overrides)
  → freshest('AED') → no ECB row → override 3.95 → { rate: 3.95 } → triangulate AED→EUR→INR
  → INR amount shown (was null before)

budgets cron: loads user_prefs (incl. fx_overrides) → convertViaRates(..., fx_overrides) → same result
```

### Error Handling

- Invalid override entries (non-currency key, non-positive/NaN value) are dropped on save (server validation) + ignored by the converter (the `positive finite` guard).
- An override for a currency ECB DOES cover is silently never used (ECB wins) — the UI helper text sets that expectation.
- Missing `fx_overrides` (legacy prefs row / null column) → parsed as `{}`; converter behaves exactly as today.

### Testing

- **Pure converter** (`tests/fx.test.ts` or new): `convertViaRates` — (1) ECB rate present → override ignored (ECB wins); (2) ECB missing + override present → override used (correct triangulated result); (3) ECB missing + no override → null; (4) override with a non-positive value → ignored → null. Same for `convertToPrimary` (fake/stub DB returning no row).
- **Prefs round-trip**: GET parses `fx_overrides` JSON; PUT persists it; invalid entries dropped. (Route unit test with a stubbed DB, mirroring existing user-prefs route tests if present.)
- UI verified via the QA runbook.

## Out of Scope (v1)

- Direct primary-pair rates ("1 AED = 23 INR") — chosen model is EUR-relative fill-the-gap.
- Overriding a rate ECB DOES provide (ECB always wins).
- Per-date manual rates / historical rate editing (a manual rate is a single standing value per currency).
- A dedicated FX-rates browser/curve UI.
