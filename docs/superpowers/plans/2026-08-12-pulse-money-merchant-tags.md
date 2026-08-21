# Money merchant + free tags — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add two first-class fields to money entries: **`merchant`** (the counterparty the ingest agent ALREADY extracts but currently drops into `description`) and **`tags`** (free-text, like tasks/learning/notes). Surface both in capture, display, and filtering.

**Architecture:** New columns on the `money_entries` projection → a migration (0015) + the op-schema + the shared `MONEY_FIELDS` (drives BOTH server materialize and client apply) + the D1/Dexie types, then chip/ingest/display/filter. Tags stored as a JSON string in D1 (like tasks/learning/notes) and as a `string[]` in the op payload + Dexie.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Adding a field to an existing entity touches BOTH the server projection (`materialize.ts` via `MONEY_FIELDS`) AND the client Dexie apply — `MONEY_FIELDS` is shared (`src/lib/entity-fields.ts`), so one edit covers both field-whitelists; verify the client `applyOp`/sync path actually persists the new fields with a round-trip test (the classic gotcha).
- **Migration:** SQLite `ALTER TABLE … ADD COLUMN` is backward-compatible (existing rows get NULL). New file `migrations/0015_money_merchant_tags.sql`. Apply to remote D1 is an OWNER step post-merge (`wrangler d1 execute pulse --remote --command "<sql>"` — NOT `--file`); a fresh clone/CI applies it via the migrations dir.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app` 200 after. **Whole-branch opus review required** (sync-core + migration).

## Background (verified)

- `src/lib/op-schemas/money.ts` `MoneyPayloadSchema` (zod) + `MoneyPayload`. Currencies in `SUPPORTED_CURRENCIES`.
- `src/lib/entity-fields.ts` `MONEY_FIELDS` = the field whitelist (shared by server materialize + client apply).
- `src/lib/materialize.ts` `materializeRow_LWW(db, op, userId, 'money_entries', MONEY_FIELDS)`. Lines ~91 & ~107 JSON.stringify `tags` for `('learning_entries'|'note_entries'|'tasks')` — **money_entries must be added to that set**.
- `src/lib/sync-client.ts` money case: `applyOp(current, op)` then `db.money_entries.put(next)` (client keeps tags as an ARRAY; the op payload carries an array).
- `src/lib/db.ts` — the Kysely `DB` interface's `money_entries` columns. `src/lib/dexie.ts` `MoneyEntryRow`.
- `src/components/confirmation-chip.tsx` — money draft UI (has a category picker, amount, date, description). Task variant already has a tags-chip UI to mirror.
- `src/lib/blank-draft.ts`, `src/lib/manual-draft.ts`, `src/lib/entry-to-draft.ts` (`moneyRowToDraft`), `src/lib/undo-delete.ts` (`resurrectPayload`) — money draft construction paths.
- `src/lib/sms-ingest.ts` `smsToMoneyPayload(r, primaryCurrency, nowIso, text, source)` — currently `description: r.merchant ?? null`. The agent response (`SmsAgentResponse`) has `merchant`.
- `src/components/money-list.tsx` (row display), `src/components/money-controls.tsx` + `src/lib/money-filter-sort.ts` (filter/sort).

---

### Task 1: data model + migration (schema foundation)

**Files:**
- Create: `migrations/0015_money_merchant_tags.sql`
- Modify: `src/lib/op-schemas/money.ts`, `src/lib/entity-fields.ts`, `src/lib/db.ts`, `src/lib/dexie.ts`, `src/lib/materialize.ts`
- Test: `src/lib/op-schemas/money.test.ts` if it exists (grep; else add one) + adapt any money materialize test

**Interfaces (Produces):** `MoneyPayload` gains `merchant?: string | null` and `tags?: string[]`. `MoneyEntryRow` gains `merchant: string | null` and `tags: string[]`.

- [ ] **Step 1: Migration** — `migrations/0015_money_merchant_tags.sql`:
```sql
-- First-class merchant + free tags on money entries.
-- merchant: counterparty/biller (the ingest agent already extracts this).
-- tags: JSON-encoded string[] (same convention as tasks/learning/notes).
ALTER TABLE money_entries ADD COLUMN merchant TEXT;
ALTER TABLE money_entries ADD COLUMN tags TEXT;
```
- [ ] **Step 2: op-schema** — `src/lib/op-schemas/money.ts`: add to `MoneyPayloadSchema`: `merchant: z.string().max(120).nullable().optional(),` and `tags: z.array(z.string().max(40)).max(20).optional(),`.
- [ ] **Step 3: `MONEY_FIELDS`** — `src/lib/entity-fields.ts`: append `'merchant', 'tags'`.
- [ ] **Step 4: DB + Dexie types** — `src/lib/db.ts` money_entries columns: add `merchant: string | null` and `tags: string | null` (D1 stores tags as a JSON string). `src/lib/dexie.ts` `MoneyEntryRow`: add `merchant: string | null` and `tags: string[]` (Dexie stores the array).
- [ ] **Step 5: server tags-as-JSON** — `src/lib/materialize.ts`: add `'money_entries'` to BOTH tag-stringify conditions (lines ~91 and ~107): `(tableName === 'money_entries' || tableName === 'learning_entries' || …)`.
- [ ] **Step 6: Tests** — grep `tests/` + `src/lib` for a money op-schema test and any money materialize round-trip; add/extend: a `MoneyPayloadSchema` parse test accepting `merchant` + `tags` (and rejecting a >40-char tag / >20 tags); a server-materialize test that an op with `tags:['a','b']` writes `tags` as the JSON string `'["a","b"]'` to `money_entries` and `merchant` verbatim. Update any existing money-payload literal that must now typecheck.
- [ ] **Step 7: Gate** `pnpm lint && pnpm typecheck && pnpm test money` → pass. **Step 8: Commit** named files.

---

### Task 2: client round-trip (the both-sides gotcha guard)

**Files:**
- Modify (only if needed): `src/lib/sync-client.ts`
- Test: `tests/sync-client.test.ts` (grep to confirm) — add a money merchant+tags round-trip

**Interfaces (Consumes Task 1).**

- [ ] **Step 1: Verify client propagation** — confirm the money `applyOp(current, op)` path persists the new `merchant` + `tags` (array) into Dexie. Because `MONEY_FIELDS` now includes them and the op payload carries them, `applyOp` should merge them automatically; if `applyOp` whitelists differently, make the minimal change so money `merchant`/`tags` land in the Dexie row as `string | null` / `string[]`.
- [ ] **Step 2: Round-trip test** — in the client sync/apply test: `generateOp({entity_kind:'money', op_type:'create', payload:{…, merchant:'CRUNCHYROLL', tags:['subscription','fun']}})` → `applyLocalOp` → `db.money_entries.get(id)` has `merchant==='CRUNCHYROLL'` and `tags` deep-equals `['subscription','fun']` (an ARRAY, not a JSON string, on the client). Then an update op changing only `tags` merges correctly (LWW per-field), leaving `merchant` intact. Run → confirm it passes (or fails first if a wiring change was needed).
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test sync` → pass. **Step 4: Commit** named files.

---

### Task 3: capture — chip, draft paths, ingest

**Files:**
- Modify: `src/components/confirmation-chip.tsx`, `src/lib/blank-draft.ts`, `src/lib/manual-draft.ts`, `src/lib/entry-to-draft.ts`, `src/lib/undo-delete.ts`, `src/lib/sms-ingest.ts`, `src/app/app/page.tsx`
- Test: `tests/lib/sms-ingest.test.ts` (merchant mapping) + adapt existing draft/entry-to-draft tests

**Interfaces:** the money `ChipDraft` variant gains `merchant?: string | null` and `tags?: string[]`.

- [ ] **Step 1: ChipDraft money type + chip UI** — `confirmation-chip.tsx`: add `merchant` + `tags` to the money draft type; render a **merchant** text input (maxLength 120, label "Merchant / payee") and a **tags** chip editor for money — REUSE the exact tags-chip pattern the task variant already uses (add-tag input + removable pills). Wire both into the draft state the chip edits.
- [ ] **Step 2: draft construction paths** — money branches of `blank-draft.ts` (`{… , merchant: null, tags: [] }`), `manual-draft.ts` (carry them through; still blank), `entry-to-draft.ts` `moneyRowToDraft` (copy `merchant` + `tags` from the row so editing preserves them), `undo-delete.ts` `resurrectPayload` money case (include `merchant` + `tags` so undo restores them).
- [ ] **Step 3: persist on confirm/update** — `src/app/app/page.tsx`: in `confirmEntry` (money create op payload) and `updateEntry` (money update op payload), include `merchant: final.merchant ?? null` and `tags: final.tags ?? []`.
- [ ] **Step 4: ingest sets merchant** — `src/lib/sms-ingest.ts` `smsToMoneyPayload`: set `merchant: r.merchant ?? null` as a first-class field. Keep `description` (either `r.merchant ?? null` as today, or null — choose null now that merchant is first-class, so the row doesn't double-show; document the choice in the report). Update `tests/lib/sms-ingest.test.ts` to assert `merchant` is set on the payload.
- [ ] **Step 5: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green. **Step 6: Commit** named files.

---

### Task 4: display + tag filter

**Files:**
- Modify: `src/components/money-list.tsx`, `src/lib/money-filter-sort.ts`, `src/components/money-controls.tsx`
- Test: `src/lib/money-filter-sort.test.ts`

**Interfaces:** `MoneyFilter` gains `tag: string | null`.

- [ ] **Step 1: Row display** — `money-list.tsx`: show `merchant` as a small secondary badge when present (don't replace the existing primary label logic; if `description` is null the primary already falls back — show merchant there too: primary = `description || merchant || cat?.name || 'Uncategorized'`, and if `merchant` and it isn't already the primary, a muted "· {merchant}" or a badge). Render money `tags` as small pills (reuse the learning/notes tag-pill styling). Keep the Task-2-slice timestamp + source/FX badges intact.
- [ ] **Step 2: Tag filter (pure)** — `money-filter-sort.ts`: add `tag: string | null` to `MoneyFilter` + `EMPTY_MONEY_FILTER`; in `filterSortMoney`, when `filter.tag` is set, keep only rows whose `tags` includes it. Extend `money-filter-sort.test.ts` with a tag-filter case (+ ensure existing cases pass with the new field).
- [ ] **Step 3: Controls** — `money-controls.tsx`: add a tag `<select>` (or input) populated from the distinct tags across the user's money entries (derive from the entries the controls already have access to, or pass in a `tags: string[]` prop from the page). "All tags" + each tag. Wire to `filter.tag`.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test money-filter-sort && pnpm build` → pass. **Step 5: Commit** named files.

## Self-review

- **Coverage:** merchant + tags added to the model (T1) with the migration; both-sides persistence proven (T2); captured via chip + ingest + all draft paths (T3); displayed + tag-filterable (T4). ✓
- **Placeholders:** none — schema/field/migration exact; UI steps name files + the reuse patterns.
- **Type consistency:** `merchant`/`tags` added to `MoneyPayload` (T1), `MoneyEntryRow` (T1), `ChipDraft` money (T3), `MoneyFilter` (T4); tags are `string[]` in payload/Dexie, JSON string in D1 (T1 Step 5).

## Post-merge (owner)

Apply the migration to the live D1: `wrangler d1 execute pulse --remote --command "ALTER TABLE money_entries ADD COLUMN merchant TEXT; ALTER TABLE money_entries ADD COLUMN tags TEXT;"` (the deploy's migration step may also apply it; verify). Then a re-sync/rebuild so ingested entries carry merchant. New bank-ingested transactions will populate `merchant`; add tags on any entry via its edit chip.
