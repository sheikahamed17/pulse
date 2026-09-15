# Split Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one payment be split across multiple categories (e.g. a supermarket swipe that's part groceries, part household, part snacks), with accurate budgets/analytics and a clean grouped display.

**Architecture:** A split is stored as **N ordinary money entries that share a `split_group_id`** — NOT one entry with embedded allocations. Each part flows through every existing aggregation (budgets, spend-breakdown, analytics, account balance, net worth, anomalies) untouched; the parts sum back to the total automatically. The only new work is (a) a nullable `split_group_id` field on the money entity, (b) a "Split" mode in the money confirmation chip that reuses the total/merchant/account/date and swaps the single category for an allocation editor, and (c) grouping the parts into one expandable row in the money list. This mirrors the "separate rows, existing math unchanged" trick that made transfers safe.

**Tech Stack:** Next 16 · React 19 · Tailwind 4 · Dexie · Cloudflare D1 (Kysely) · op-log + per-field HLC LWW.

## Global Constraints

- `split_group_id` is a **new nullable field on the EXISTING money entity** — NOT a new entity_kind. Wire it like `account_id` was (migration 0017): op-schema + `MONEY_FIELDS` + Dexie `MoneyEntryRow` + Kysely `MoneyEntryTable` + a D1 `ALTER TABLE money_entries`. **No** `sync-client.ts` change, **no** `materialize.ts` case change (both use `MONEY_FIELDS`), **no** Dexie version bump (the field is not indexed — grouping is done in-memory).
- Migration ≥0005 must be applied to remote D1 **manually** before merge: `node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "ALTER TABLE money_entries ADD COLUMN split_group_id TEXT"`.
- Money amounts are minor units (÷100 for display, JPY ÷1).
- **NEVER read `e.currentTarget.value`/`e.target.value` inside a `setState(s => …)` updater** — capture the value in a const first (see 8e222cf). Applies to every new handler in the chip.
- Split parts share: `currency`, `direction`, `occurred_at`, `source`, `merchant`, `account_id`, `description`, `raw_input`, `split_group_id`. They differ only in `category_id` and `amount`.
- v1 split validation is EXACT: ≥2 allocations, each amount > 0, `sum(amounts) === total`. Recurring is disabled in split mode.
- Gate before every commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

### Task 1: Schema + field wiring for `split_group_id`

**Files:**
- Create: `migrations/0024_money_split_group.sql`
- Modify: `src/lib/op-schemas/money.ts`, `src/lib/entity-fields.ts`, `src/lib/dexie.ts` (MoneyEntryRow), `src/lib/db.ts` (MoneyEntryTable)
- Test: extend `tests/sync-integration.test.ts` (money op with split_group_id round-trips)

**Interfaces:**
- Produces: `MoneyPayload.split_group_id?: string | null`; `MoneyEntryRow.split_group_id: string | null`; `'split_group_id'` in `MONEY_FIELDS`.

- [ ] **Step 1: Migration.** Create `migrations/0024_money_split_group.sql`:
```sql
-- Group id shared by the N money entries that make up one split payment.
-- Nullable: a normal (non-split) entry has NULL. No index (grouping is in-memory).
-- Apply to remote: wrangler d1 execute pulse --remote --command "ALTER TABLE money_entries ADD COLUMN split_group_id TEXT"
ALTER TABLE money_entries ADD COLUMN split_group_id TEXT;
```

- [ ] **Step 2: op-schema.** In `src/lib/op-schemas/money.ts`, add to `MoneyPayloadSchema` (after `account_id`):
```ts
  split_group_id: z.string().min(1).nullable().optional(),
```

- [ ] **Step 3: MONEY_FIELDS.** In `src/lib/entity-fields.ts`, add `'split_group_id'` to the `MONEY_FIELDS` array.

- [ ] **Step 4: Dexie row.** In `src/lib/dexie.ts` `MoneyEntryRow`, add after `account_id`:
```ts
  split_group_id: string | null
```

- [ ] **Step 5: Kysely table.** In `src/lib/db.ts` `MoneyEntryTable`, add after `account_id`:
```ts
  split_group_id: string | null
```

- [ ] **Step 6: Round-trip test.** In `tests/sync-integration.test.ts`, add a test in the "Phase 1 entity kinds" describe: push a money create op with `split_group_id: 'grp-1'`, pull it back, assert `pulledOp.payload.split_group_id === 'grp-1'`. Run `npx vitest run tests/sync-integration.test.ts` → PASS.

- [ ] **Step 7: Gate + apply migration to remote + commit.** Run the full gate; apply the migration to remote D1 (command above) and verify (`SELECT split_group_id FROM money_entries LIMIT 1`); commit.

---

### Task 2: Pure split-allocation logic

**Files:**
- Create: `src/lib/split-transaction.ts`, `src/lib/split-transaction.test.ts`

**Interfaces:**
- Produces:
```ts
export type Allocation = { category_id: string | null; amount: number } // minor units
export function allocatedTotal(allocations: Allocation[]): number
export function splitRemaining(total: number, allocations: Allocation[]): number // total - allocatedTotal
export function isSplitValid(total: number, allocations: Allocation[]): boolean // ≥2, each >0, sum === total
```

- [ ] **Step 1: Failing test** (`src/lib/split-transaction.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { allocatedTotal, splitRemaining, isSplitValid } from './split-transaction'

describe('split-transaction', () => {
  const a = [{ category_id: 'g', amount: 1500 }, { category_id: 'h', amount: 700 }, { category_id: null, amount: 200 }]
  it('sums allocations', () => expect(allocatedTotal(a)).toBe(2400))
  it('computes remaining', () => {
    expect(splitRemaining(2400, a)).toBe(0)
    expect(splitRemaining(3000, a)).toBe(600)
  })
  it('valid only when ≥2 parts, each >0, exact sum', () => {
    expect(isSplitValid(2400, a)).toBe(true)
    expect(isSplitValid(2401, a)).toBe(false)                                   // under
    expect(isSplitValid(2400, [{ category_id: 'g', amount: 2400 }])).toBe(false) // 1 part
    expect(isSplitValid(2400, [{ category_id: 'g', amount: 2400 }, { category_id: 'h', amount: 0 }])).toBe(false) // zero part
  })
})
```

- [ ] **Step 2: Run → fail** (`npx vitest run src/lib/split-transaction.test.ts`).

- [ ] **Step 3: Implement** `src/lib/split-transaction.ts`:
```ts
export type Allocation = { category_id: string | null; amount: number } // minor units

export function allocatedTotal(allocations: Allocation[]): number {
  return allocations.reduce((n, a) => n + a.amount, 0)
}

export function splitRemaining(total: number, allocations: Allocation[]): number {
  return total - allocatedTotal(allocations)
}

export function isSplitValid(total: number, allocations: Allocation[]): boolean {
  if (allocations.length < 2) return false
  if (allocations.some(a => !(a.amount > 0))) return false
  return allocatedTotal(allocations) === total
}
```

- [ ] **Step 4: Run → pass. Commit.**

---

### Task 3: Money-list grouping helper (pure)

**Files:**
- Create: `src/lib/split-group.ts`, `src/lib/split-group.test.ts`

**Interfaces:**
- Produces:
```ts
export type MoneyRowGroup<T> =
  | { kind: 'single'; entry: T }
  | { kind: 'split'; groupId: string; parts: T[]; total: number }
// groupBySplit keeps the INPUT ORDER: a split group appears at the position of its
// first-seen part; parts within a group keep their relative order. Amounts summed for total.
export function groupBySplit<T extends { split_group_id?: string | null; amount: number }>(entries: T[]): MoneyRowGroup<T>[]
```

- [ ] **Step 1: Failing test** covering: entries with no split_group_id → all `single`; entries sharing a group id → one `split` with parts + summed total, positioned at the first part; mixed order preserved. (Write concrete assertions with a 5-entry fixture: single, split-part-A, single, split-part-B, single → expect [single, split(A,B), single, single] — the split appears where A first appeared.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `groupBySplit`: iterate once; for a null/empty `split_group_id` push a `single`; for a group id not seen before, create a `split` placeholder at this position and remember its index; for a subsequent part of a known group, push into its `parts` and add to `total`.

- [ ] **Step 4: Run → pass. Commit.**

---

### Task 4: Chip "Split" mode

**Files:**
- Modify: `src/components/confirmation-chip.tsx` (ConfirmationChipMoney + the `onConfirm` type)
- Modify: `src/app/app/page.tsx` (confirmEntry signature is the consumer — see Task 5)

**Interfaces:**
- Consumes: `Allocation` from `@/lib/split-transaction`; `isSplitValid`, `splitRemaining`.
- Produces (type change): extend `Props['onConfirm']` to
```ts
onConfirm: (final: ChipDraft, recurring: { enabled: boolean; period: Period; intervalCount: number }, splitAllocations?: import('@/lib/split-transaction').Allocation[]) => Promise<void>
```
  Non-money chips and non-split money confirms pass `undefined`.

- [ ] **Step 1:** In `ConfirmationChipMoney`, add state: `const [splitMode, setSplitMode] = useState(false)` and `const [allocations, setAllocations] = useState<Allocation[]>([])`. Add a "Split across categories" toggle button near the category row (only when `!isEdit` — editing a split is out of v1). Toggling ON seeds `allocations` with the current single category as the first row: `[{ category_id: d.category_id ?? null, amount: d.amount }]` then an empty second row.

- [ ] **Step 2:** When `splitMode`, render an **allocation editor** in place of the single category button: for each allocation row, a `<CategoryPicker kind={d.direction === 'out' ? 'spend' : 'income'} …>` (or a compact category select) + an amount input + a remove-row button; an "＋ Add category" button; and a live line `Remaining: {symbol}{fmt(splitRemaining(d.amount, allocations))}` styled `text-destructive` when non-zero. **Every amount/category handler captures the event value in a const before `setState`** (crash-class rule). Amount input parses via `parseAmountInput`.

- [ ] **Step 3:** In split mode, hide the "Make recurring" toggle. The Confirm button is disabled unless `isSplitValid(d.amount, allocations)` (in addition to `d.amount > 0`). Its label reads `Confirm split ({allocations.length})`.

- [ ] **Step 4:** `handleConfirm`: if `splitMode` pass `onConfirm(d, recurring, allocations)`; else `onConfirm(d, recurring, undefined)` (unchanged behavior).

- [ ] **Step 5:** Gate. (No unit test for the chip render — jsdom is not in the test env; verified via the QA runbook + Task 6 review. The pure allocation math is covered in Task 2.) Commit.

---

### Task 5: `confirmEntry` split path (create N entries)

**Files:**
- Modify: `src/app/app/page.tsx` (`confirmEntry`)

**Interfaces:**
- Consumes: `splitAllocations?: Allocation[]` (new 3rd param), `crypto.randomUUID()`.

- [ ] **Step 1:** Change `confirmEntry(final, recurring)` to `confirmEntry(final, recurring, splitAllocations?)` and update the `<ConfirmationChip onConfirm={confirmEntry}>` prop (types flow from Task 4).

- [ ] **Step 2:** In the money branch, BEFORE the single-entry create: if `splitAllocations && splitAllocations.length > 0` (and not editing), generate `const groupId = crypto.randomUUID()` and, for EACH allocation, `await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: crypto.randomUUID(), op_type: 'create', payload: { amount: alloc.amount, currency: final.currency, direction: final.direction, category_id: alloc.category_id ?? null, description: final.description ?? null, merchant: final.merchant ?? null, tags: final.tags ?? [], occurred_at: final.occurred_at, source: final.source, raw_input: final.raw_input ?? null, recurring_rule_id: null, receipt_key: null, account_id: final.account_id ?? null, split_group_id: groupId }, user_id: user.id }))`. Then `setTab('money')`, clear draft/editId, `pushPullOnce(...).catch(...)`, and RETURN (skip the single-entry path). Recurring is ignored in split mode (the chip disables it).

- [ ] **Step 3:** Gate. Commit.

---

### Task 6: Money-list grouped display + group delete

**Files:**
- Modify: `src/components/money-list.tsx`

**Interfaces:**
- Consumes: `groupBySplit` (Task 3).

- [ ] **Step 1:** After computing `shown` (the filtered/sorted entries), build `const groups = useMemo(() => groupBySplit(shown), [shown])` and render `groups.map(...)`: a `single` renders the existing `<SwipeRow>` row unchanged; a `split` renders ONE row showing the summed `total` + shared merchant/date + a "N categories" pill, expandable (a `useState` open-set keyed by groupId) to list each part's category + amount (÷100, JPY÷1).

- [ ] **Step 2:** Deleting a split group deletes ALL parts: a `deleteGroup(parts)` that runs `deleteEntry`-style ops for each part, pushing ONE undo entry whose undo resurrects every part (reuse `resurrectPayload` per part). Individual parts remain editable via the existing per-row edit (each is a normal entry).

- [ ] **Step 3:** Filtering/sorting still operate on individual entries (a filter that matches ONE part shows that part; documented v1 behavior — a split may appear partially under a category filter). Note this in the QA runbook.

- [ ] **Step 4:** Gate. Commit.

---

### Task 7: Whole-branch review + finish

- [ ] Run the whole-branch opus review (superpowers:requesting-code-review) over the full diff — focus: no aggregation was accidentally taught about splits (they must stay generic), the chip's new handlers never read events inside a setState updater, group delete/undo restores all parts, and the migration is applied to remote.
- [ ] Address Critical/Important findings.
- [ ] Full gate green; merge to main; verify CI + Deploy green + prod 200; QA runbook for on-device (create a 3-way split, confirm budgets/analytics attribute each part, list groups + expands, delete-group + undo).

## Self-Review

- **Spec coverage:** model (multi-entry + split_group_id) ✓ Task 1; chip Split mode ✓ Task 4; exact-sum validation ✓ Task 2/4; grouped display ✓ Task 3/6; group delete+undo ✓ Task 6; migration-to-remote ✓ Task 1. Recurring-in-split explicitly deferred (chip disables it).
- **Type consistency:** `Allocation` defined once (Task 2), consumed by chip (Task 4) + confirmEntry (Task 5); `onConfirm` 3rd param added in Task 4 and consumed in Task 5; `groupBySplit`/`MoneyRowGroup` defined Task 3, consumed Task 6.
- **No new entity_kind** → confirmed no sync-client/materialize case work (MONEY_FIELDS-driven), no Dexie bump (unindexed).
- **Crash-class guard:** Task 4 Step 2 explicitly requires capturing event values before setState.
