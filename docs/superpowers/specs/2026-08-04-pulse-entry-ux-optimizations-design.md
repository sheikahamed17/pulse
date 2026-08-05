# Pulse — Entry UX optimizations: quick manual-add + inline categorize (design)

**Date:** 2026-08-04
**Status:** approved for planning

## Problem

Two just-shipped money features have avoidable friction:
1. **Manual add** opens the shared `ConfirmationChip` (a "tap any field to edit" confirmation card). For a blank entry the amount shows as `₹0` you must tap, then clear, then type — and it isn't focused. A quick "add ₹200" is several taps.
2. **Categorize** (push notification + the ⚠ Set category pill) opens the **full** transaction edit card (amount/direction/date/Save) when the user only wants to pick a category.

## Goals

- **Opt 1 — quick manual amount:** when the money chip opens blank (initial `amount === 0`), the amount is an **auto-focused, empty** decimal input that updates **live** as you type; a parsed draft (`amount > 0`) is unchanged.
- **Opt 2 — inline categorize:** the ⚠ Set category pill and the push deep-link open a compact **inline category picker on the row** (pick → set instantly via an update op), not the full edit card.

## Non-goals (YAGNI)

- The fuller always-visible manual form; inline-category-by-default in the chip.
- The batch "Needs category" inbox.
- Any change to task/learning/note chips, voice/text/receipt confirm, or the long-press → Edit flow (which still opens the full chip).
- No new dependency, migration, cron, or `entity_kind`.

## Architecture

Both are refinements of existing components (`src/components/confirmation-chip.tsx`, `src/components/money-list.tsx`, `src/app/app/page.tsx`), reusing `CategoryPicker` and the `generateOp`/`applyLocalOp`/`pushPullOnce` op path already used in `money-list.tsx` (`deleteEntry`).

### Opt 1 — quick manual amount (`ConfirmationChipMoney`)

- New pure helper **`src/lib/parse-amount.ts`** — `parseAmountInput(raw: string): number | null`: strips commas, trims; empty/invalid/negative → `null`; else `Math.round(v * 100)` (minor units, matching the chip's existing `amount * 100` convention — comma-stripping also fixes a latent bug where editing an amount ≥ 1000 like `"2,000"` currently `parseFloat`s to `2`).
- In `ConfirmationChipMoney`: initialize `editingField` to `'amount'` when `draft.amount === 0` (so the amount opens as an input, `autoFocus`, empty). The amount input:
  - `defaultValue={d.amount === 0 ? '' : major}`, `placeholder="0"`, `inputMode="decimal"`, `autoFocus`.
  - `onChange` → `setD(s => ({ ...s, amount: parseAmountInput(e.currentTarget.value) ?? 0 }))` (live update; empty → 0 keeps Confirm disabled via the existing `disabled={busy || d.amount === 0}` guard, and the `Confirm ₹{major}` label tracks live).
  - `onBlur` → `setEditingField(null)` (collapse to the button; the value is already committed via onChange).
- A parsed draft (`amount > 0`) initializes `editingField = null` → the current tap-to-edit button is unchanged. No new prop; the gate is the initial amount.

### Opt 2 — inline categorize (`MoneyList` + `page.tsx`)

- **`MoneyList`** gains local `const [pickingId, setPickingId] = useState<string | null>(null)`.
  - The ⚠ Set category pill's `onClick` becomes `setPickingId(pickingId === e.id ? null : e.id)` (toggle) — it no longer calls `onEdit(e)`.
  - When `pickingId === e.id`, render `<CategoryPicker userId={userId} kind={e.direction === 'out' ? 'spend' : 'income'} selectedId={e.category_id ?? null} onSelect={id => setCategory(e, id)} />` as a **sibling block below the `SwipeRow`** inside the `<li>` (NOT inside the SwipeRow's `overflow-hidden` swipe area, so it isn't clipped) + a small "Cancel" to collapse.
  - `setCategory(e, categoryId)`: `generateOp({ entity_kind:'money', entity_id:e.id, op_type:'update', payload:{ category_id: categoryId }, user_id:userId })` → `applyLocalOp` → `pushPullOnce({userId})` → `setPickingId(null)`. (Same op path as `deleteEntry`.)
  - New optional prop `categorizeId?: string | null`: an effect opens that row's picker once per id (`handledCategorizeRef`) — `setPickingId(categorizeId)` + `scrollIntoView` on `#pulse-row-<id>`.
- **`page.tsx`** — the `/app?categorize=<id>` effect is simplified: `setTab('money')` + `setCategorizeId(id)` + strip the param (`router.replace('/app?tab=money')`). It no longer does `db.money_entries.get` / `moneyRowToDraft` / `setEditId` / `setDraft` for the categorize path (the `draftOpenRef` guard is no longer needed for categorize). A new `const [categorizeId, setCategorizeId] = useState<string|null>(null)` is passed to `<MoneyList … categorizeId={categorizeId} />`. The pill's `onEdit` prop stays wired for the long-press Edit menu (full chip, unchanged).

## Data flow

```
Opt 1:  + Add → blank money chip (amount 0) → amount input autofocused+empty
        → type "200" → onChange parseAmountInput → d.amount=20000 (live)
        → Confirm enabled → confirmEntry (create, source:'manual')

Opt 2:  ⚠ Set category pill  ─┐
        push → /app?categorize=<id> → setTab(money)+setCategorizeId(id) ─┤
                                                                          ▼
        MoneyList opens inline CategoryPicker on that row → pick
        → update op {category_id} → applyLocalOp → sync → row shows category
```

## Error handling

- **parseAmountInput:** empty/invalid/negative → `null` → treated as amount 0 → Confirm stays disabled (can't create a ₹0 entry).
- **Deep-link row not present** (deleted / not yet synced): the `categorizeId` effect finds no `#pulse-row-<id>` to scroll to and no matching row renders a picker — harmless no-op; the entry appears after sync and the pill is the fallback.
- **Category update op** follows the existing LWW path; picking again just writes a newer op.

## Testing

- **`parse-amount.test.ts`:** `"200"`→20000; `"2,000.50"`→200050 (comma stripped); `""`/`"abc"`/`"-5"`→null; `"0"`→0.
- The chip amount-input wiring, the money-list inline picker, and the page deep-link change are presentational/integration (no render harness in this repo) → verified by `pnpm exec tsc --noEmit` + `pnpm build` + the QA runbook.
- Full `pnpm test` + `pnpm build` green.

## Global constraints

- No new dependency, migration, cron, or `entity_kind`.
- Opt 1 changes apply ONLY when the money draft opens with `amount === 0`; the parsed-confirm/edit flows are untouched.
- Opt 2 replaces ONLY the categorize path (pill + push deep-link); long-press → Edit still opens the full chip.
- Category update uses the existing `generateOp`/`applyLocalOp`/`pushPullOnce` path; amount stays in minor units (`× 100`).
- Merging to `main` auto-deploys; verify CI + Deploy green + prod HTTP 200.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
