# Entry UX Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual "+ Add" fast (auto-focused, empty, live amount input) and make categorizing an auto-fetched transaction a one-tap inline pick (no full edit card).

**Architecture:** Refine three existing files. A pure `parseAmountInput` helper backs a live amount input in the money chip's blank case. `MoneyList` grows an inline `CategoryPicker` opened by the ⚠ pill or a `categorizeId` prop; `page.tsx`'s push deep-link is simplified to drive that prop instead of the full edit chip.

**Tech Stack:** Next 16 / React 19 / TypeScript, Vitest, Dexie, existing `CategoryPicker` + `generateOp`/`applyLocalOp`/`pushPullOnce` op path.

## Global Constraints

- No new dependency, migration, cron, or `entity_kind`.
- **Opt 1** changes apply ONLY when the money draft opens with `amount === 0`; the parsed-confirm (`amount > 0`) and edit flows are untouched.
- **Opt 2** replaces ONLY the categorize path (⚠ pill + push deep-link); long-press → **Edit** still opens the full chip (the `onEdit` prop stays wired for the menu).
- `parseAmountInput` returns MINOR units (`× 100`), matching the chip's existing amount convention; it strips commas.
- Category update uses `generateOp({entity_kind:'money', op_type:'update', payload:{category_id}})` → `applyLocalOp` → `pushPullOnce` (same path as `deleteEntry`).
- The inline `CategoryPicker` renders as a sibling BELOW the `SwipeRow` inside the `<li>` (NOT inside the SwipeRow's `overflow-hidden` swipe area, so it isn't clipped).
- Presentational changes (chip, money-list, page) have NO render harness → verified by `pnpm exec tsc --noEmit` + `pnpm build` + the QA runbook. Do NOT fabricate render tests.
- Merging to `main` auto-deploys; verify CI + Deploy green + prod HTTP 200.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Tests: `pnpm test`; typecheck: `pnpm exec tsc --noEmit`.

---

### Task 1: `parseAmountInput` pure helper

**Files:**
- Create: `src/lib/parse-amount.ts`
- Test: `tests/lib/parse-amount.test.ts`

**Interfaces:**
- Produces: `parseAmountInput(raw: string): number | null` — decimal string → minor units (`× 100`); `null` for empty/invalid/negative.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/parse-amount.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseAmountInput } from '@/lib/parse-amount'

describe('parseAmountInput', () => {
  it('parses a plain amount to minor units', () => {
    expect(parseAmountInput('200')).toBe(20000)
    expect(parseAmountInput('80.50')).toBe(8050)
  })
  it('strips thousands commas', () => {
    expect(parseAmountInput('2,000.50')).toBe(200050)
    expect(parseAmountInput('1,00,000')).toBe(10000000) // Indian grouping too
  })
  it('returns null for empty / whitespace / invalid / negative', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('   ')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('-5')).toBeNull()
  })
  it('treats 0 as a real zero (not null)', () => {
    expect(parseAmountInput('0')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- parse-amount`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/parse-amount.ts`:

```ts
/**
 * Parse a user-typed amount string into MINOR units (× 100), matching the money
 * chip's amount convention. Strips grouping commas. Returns null for
 * empty/invalid/negative input (so the caller can keep the entry un-confirmable).
 */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const v = Number.parseFloat(cleaned)
  if (!Number.isFinite(v) || v < 0) return null
  return Math.round(v * 100)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- parse-amount`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse-amount.ts tests/lib/parse-amount.test.ts
git commit -m "feat: parseAmountInput helper (decimal string -> minor units, comma-safe)"
```

---

### Task 2: Money chip — auto-focused live amount input when blank

**Files:**
- Modify: `src/components/confirmation-chip.tsx` (`ConfirmationChipMoney`)

**Interfaces:**
- Consumes: `parseAmountInput` (Task 1).

**Note:** presentational, no render harness → verify with `pnpm exec tsc --noEmit`. Do NOT write a render test.

- [ ] **Step 1: Import the helper**

At the top of `src/components/confirmation-chip.tsx`, add:
```ts
import { parseAmountInput } from '@/lib/parse-amount'
```

- [ ] **Step 2: Open the amount field by default when blank**

In `ConfirmationChipMoney`, change the `editingField` initializer so a blank draft opens straight into amount entry. Replace:
```ts
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category' | 'date'>(null)
```
with:
```ts
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category' | 'date'>(draft.amount === 0 ? 'amount' : null)
```

- [ ] **Step 3: Make the amount input empty + live-updating**

Replace the amount `editingField === 'amount'` input block:
```tsx
      {editingField === 'amount' ? (
        <Input
          autoFocus
          inputMode="decimal"
          defaultValue={major}
          onBlur={(e) => {
            const v = parseFloat(e.currentTarget.value)
            if (!Number.isNaN(v) && v >= 0) setD(s => ({ ...s, amount: Math.round(v * 100) }))
            setEditingField(null)
          }}
          className="mb-3 font-mono text-3xl font-semibold"
        />
      ) : (
```
with:
```tsx
      {editingField === 'amount' ? (
        <Input
          autoFocus
          inputMode="decimal"
          defaultValue={d.amount === 0 ? '' : major}
          placeholder="0"
          onChange={(e) => setD(s => ({ ...s, amount: parseAmountInput(e.currentTarget.value) ?? 0 }))}
          onBlur={() => setEditingField(null)}
          className="mb-3 font-mono text-3xl font-semibold"
        />
      ) : (
```
(The tap-to-reveal button branch below is unchanged. A parsed draft `amount > 0` still starts with `editingField = null`, so it shows the button exactly as before. The Confirm button's existing `disabled={busy || d.amount === 0}` guard now enables live as the user types.)

- [ ] **Step 4: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/confirmation-chip.tsx
git commit -m "feat: money chip opens a focused empty live amount input when blank"
```

---

### Task 3: `MoneyList` — inline category picker (pill + categorizeId)

**Files:**
- Modify: `src/components/money-list.tsx`

**Interfaces:**
- Consumes: existing `CategoryPicker` (`<CategoryPicker userId kind selectedId onSelect />`), `generateOp`/`applyLocalOp`/`pushPullOnce`.
- Produces: `MoneyList` accepts a new optional prop `categorizeId?: string | null` (Task 4 passes it).

**Note:** presentational → verify with `pnpm exec tsc --noEmit`.

- [ ] **Step 1: Imports + props + state**

In `src/components/money-list.tsx`:
(a) Widen the React import:
```ts
import { useEffect, useMemo, useRef, useState } from 'react'
```
(b) Add the CategoryPicker import (next to the other component imports):
```ts
import { CategoryPicker } from '@/components/category-picker'
```
(c) Widen Props:
```ts
type Props = { userId: string; onEdit?: (row: MoneyEntryRow) => void; categorizeId?: string | null }
```
(d) Destructure the new prop:
```ts
export function MoneyList({ userId, onEdit, categorizeId }: Props) {
```
(e) Add state + a once-per-id ref (near the other `useState`s):
```ts
  const [pickingId, setPickingId] = useState<string | null>(null)
  const handledCategorizeRef = useRef<string | null>(null)
```

- [ ] **Step 2: setCategory + the deep-link open-once effect**

Add `setCategory` next to `deleteEntry`:
```ts
  async function setCategory(e: MoneyEntryRow, categoryId: string) {
    const op = await generateOp({
      entity_kind: 'money', entity_id: e.id,
      op_type: 'update', payload: { category_id: categoryId },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setPickingId(null)
  }
```
Add the effect (after the `categoryById` useMemo):
```ts
  // Push deep-link: open a specific row's inline category picker once + scroll to it.
  useEffect(() => {
    if (categorizeId && handledCategorizeRef.current !== categorizeId) {
      handledCategorizeRef.current = categorizeId
      setPickingId(categorizeId)
      requestAnimationFrame(() => {
        document.getElementById(`pulse-row-${categorizeId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
  }, [categorizeId])
```

- [ ] **Step 3: Pill opens the inline picker (not the edit chip)**

Replace the ⚠ Set category pill's `onClick`:
```tsx
                        onClick={(ev) => { ev.stopPropagation(); onEdit(e) }}
```
with:
```tsx
                        onClick={(ev) => { ev.stopPropagation(); setPickingId(pickingId === e.id ? null : e.id) }}
```
And change its render condition to no longer require `onEdit` (the pill now drives the inline picker, which doesn't need `onEdit`): replace
```tsx
                    {!e.category_id && (e.source === 'email' || e.source === 'sms') && onEdit && (
```
with
```tsx
                    {!e.category_id && (e.source === 'email' || e.source === 'sms') && (
```

- [ ] **Step 4: Render the inline picker as a sibling below the SwipeRow**

Immediately AFTER the `</SwipeRow>` closing tag and BEFORE the `{menuFor === e.id && (…)}` block, insert:
```tsx
              {pickingId === e.id && (
                <div className="glass-soft mt-1 rounded-2xl p-2">
                  <CategoryPicker
                    userId={userId}
                    kind={e.direction === 'out' ? 'spend' : 'income'}
                    selectedId={e.category_id ?? null}
                    onSelect={(id) => setCategory(e, id)}
                  />
                  <button
                    type="button"
                    onClick={() => setPickingId(null)}
                    className="mt-1 px-2 py-1 min-h-[44px] text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                  >
                    Cancel
                  </button>
                </div>
              )}
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0. (If `CategoryPicker`'s `onSelect` type differs from `(id: string) => void`, read `src/components/category-picker.tsx` and match its exact signature — the behavior is `setCategory(e, id)`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/money-list.tsx
git commit -m "feat: inline category picker on money rows (pill + categorizeId), one-tap set"
```

---

### Task 4: `page.tsx` — drive the inline picker from the push deep-link

**Files:**
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `MoneyList` `categorizeId` prop (Task 3).

**Note:** presentational/integration → verify with `pnpm exec tsc --noEmit` + `pnpm build`.

- [ ] **Step 1: Add categorizeId state; remove the now-unused draftOpenRef**

In `AppPageInner`:
(a) Add state (near the other `useState`s, e.g. after `const [editId, setEditId] = useState<string | null>(null)`):
```ts
  const [categorizeId, setCategorizeId] = useState<string | null>(null)
```
(b) Remove the `draftOpenRef` declaration line:
```ts
  const draftOpenRef = useRef(false)
```
(c) Remove its sync effect line:
```ts
  useEffect(() => { draftOpenRef.current = draft !== null }, [draft])
```

- [ ] **Step 2: Simplify the categorize deep-link effect**

Replace the whole deep-link block:
```tsx
  // Deep-link from an ingest push: /app?categorize=<id> → open that money entry's
  // edit chip (category picker) on the Money tab, then strip the param. Runs once
  // per id; never clobbers an already-open draft.
  const categorizeHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) return
    const cid = searchParams.get('categorize')
    if (!cid || categorizeHandledRef.current === cid) return
    categorizeHandledRef.current = cid
    let cancelled = false
    ;(async () => {
      const row = await db.money_entries.get(cid)
      if (cancelled) return
      setTab('money')
      if (row && !draftOpenRef.current) { setEditId(cid); setDraft(moneyRowToDraft(row)) }
      router.replace('/app?tab=money')
    })()
    return () => { cancelled = true }
  }, [user, searchParams, router, setTab])
```
with:
```tsx
  // Deep-link from an ingest push: /app?categorize=<id> → open that row's inline
  // category picker on the Money tab, then strip the param. Runs once per id.
  const categorizeHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) return
    const cid = searchParams.get('categorize')
    if (!cid || categorizeHandledRef.current === cid) return
    categorizeHandledRef.current = cid
    setTab('money')
    setCategorizeId(cid)
    router.replace('/app?tab=money')
  }, [user, searchParams, router, setTab])
```
(`moneyRowToDraft` stays imported — still used by `editMoney`. `db`/`setEditId`/`setDraft` stay used elsewhere.)

- [ ] **Step 3: Pass categorizeId to MoneyList**

Replace:
```tsx
              <MoneyList userId={user.id} onEdit={editMoney} />
```
with:
```tsx
              <MoneyList userId={user.id} onEdit={editMoney} categorizeId={categorizeId} />
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm exec tsc --noEmit` (expect exit 0), then `pnpm build` (expect success; `/app` compiles).

- [ ] **Step 5: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: push categorize deep-link opens the inline row picker (drop full-chip path)"
```

---

### Task 5: QA runbook

**Files:**
- Create: `docs/superpowers/notes/2026-08-04-pulse-entry-ux-optimizations-qa-runbook.md`

- [ ] **Step 1: Write the runbook**

Create the file:
```markdown
# Entry UX optimizations — QA Runbook (on-device)

## Quick manual add (amount)
1. On the Money tab, tap "+ Add". The amount field is already focused + empty, number pad up.
2. Type "200" — the Confirm button enables and reads "Confirm ₹200" as you type (no tapping ₹0 / clearing first).
3. Type an amount with a comma ("2,000") — it's parsed correctly (₹2,000, not ₹2).
4. Leave it empty → Confirm stays disabled (can't save a ₹0 entry).
5. A voice/typed capture that parsed an amount still shows the amount as a tap-to-edit value (unchanged).

## Inline categorize
6. An auto-fetched (📧/💳) row with no category shows "⚠ Set category" → tap it → a category picker opens right under the row.
7. Tap a category → it's set instantly (no full edit card, no "Save changes"); the picker closes and the row shows the category.
8. Tap the ingest push notification → the app opens the Money tab and that row's picker opens + scrolls into view.
9. Long-press a row → Edit still opens the full edit card (unchanged).

## Notes
- No migration/cron/dep. parseAmountInput returns minor units (×100), comma-safe; also fixes a latent "2,000"→₹2 edit bug.
- The inline picker renders below the row (outside the swipe-clip) so it isn't cut off.
- Category set uses the same op path as delete (generateOp update → applyLocalOp → pushPull), so it syncs like any edit.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-08-04-pulse-entry-ux-optimizations-qa-runbook.md
git commit -m "docs: QA runbook for entry UX optimizations"
```

---

## After all tasks

- Run full `pnpm test` + `pnpm build` — both green.
- Whole-branch review (opus), then finishing-a-development-branch → merge `entry-ux-optimizations` to `main` (auto-deploys).
- Verify CI + "Deploy to Cloudflare Workers" both green + prod HTTP 200.
- Owner follow-up (device): + Add → type an amount (keypad, no extra taps); tap a ⚠ pill → pick inline; tap an ingest push → row picker opens.
