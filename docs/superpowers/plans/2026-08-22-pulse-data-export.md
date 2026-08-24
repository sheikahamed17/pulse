# Data export / import (backup & restore) — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let the user download a complete backup of their data and re-import/restore it — plus a human-friendly money CSV — all from Settings, client-side.

**Architecture:** PURE client feature over the existing op-log. **Export = `db.op_log.toArray()`** (the client op_log is the complete history — `applyLocalOp` writes every local AND server-received op, deduped by id). **Import = replay each op through the existing `applyLocalOp`** (idempotent by op id + per-field HLC LWW), then `pushPullOnce` to sync to the server. No server route, no migration, no new entity. Import can only add/update via LWW — never clobbers newer local data; re-importing the same file is a no-op.

## v1 scope + non-goals

- v1 = (1) **Export backup (JSON)** — the full op_log, re-importable; (2) **Export money CSV** — human/spreadsheet-friendly; (3) **Import backup (JSON)** — replay + sync. On a new `/settings/data` page.
- **Deferred:** CSV for tasks/learning/notes; selective/date-ranged export; a destructive "replace all" import (v1 import is merge-only); encryption of the backup file; scheduled/auto backups.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (`new Date()` in a handler is fine).
- Client-only; NO migration/entity/sync-contract change. Reuse `applyLocalOp`/`pushPullOnce` (`@/lib/sync-client`), `db.op_log`/`db.money_entries` (`@/lib/dexie`), `OpSchema`/`Op` (`@/types/ops`).
- Money amounts are minor units → CSV shows MAJOR units (`amount / (currency==='JPY' ? 1 : 100)`).
- File download from a PWA: build a `Blob`, `URL.createObjectURL`, click a temporary `<a download>`, revoke. Import via `<input type="file">` + `FileReader`/`.text()`.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/settings/data` 200. **Whole-branch opus review** (the import path replays ops into the sync core): confirm import is idempotent + non-destructive, malformed files are rejected safely, and export is complete.

## Background (verified)

- `applyLocalOp(op)` (`src/lib/sync-client.ts`): `const existing = await db.op_log.get(op.id); if (existing) return` (idempotent) → `db.op_log.add(op)` + `applyOp` per-field LWW into the entity table. Called for BOTH local ops and every server op in `pushPullOnce` ⇒ **`db.op_log` is the complete history**.
- `OpSchema` (zod) + `Op` type in `@/types/ops`; `ENTITY_KINDS`/`OP_TYPES` enums back it.
- `MoneyEntryRow` fields: id, amount (minor), currency, direction ('out'|'in'), category_id, description, occurred_at, source, merchant, tags (string[]), account_id, deleted_at, …
- Settings hub: `src/app/settings/page.tsx` (link rows). A settings sub-page pattern: `src/app/settings/accounts/page.tsx` (auth shell).

---

### Task 1: pure backup / CSV helpers

**Files:** Create `src/lib/data-export.ts`, `src/lib/data-export.test.ts`

**Interfaces (Produces):**
- `type Backup = { app: 'pulse'; version: 1; exported_at: string; op_count: number; ops: Op[] }`
- `buildBackup(ops: Op[], exportedAt: string): Backup` — `{ app:'pulse', version:1, exported_at: exportedAt, op_count: ops.length, ops }`. Pure.
- `parseBackup(text: string): { ok: true; ops: Op[] } | { ok: false; error: string }` — `JSON.parse` in try/catch (→ `{ok:false,error:'Not valid JSON'}`); require `app==='pulse'` && `version===1` && `Array.isArray(ops)` (→ a clear error each); validate each op with `OpSchema.safeParse` — collect the count of invalid ops; if any invalid → `{ok:false, error:`N of M entries are invalid`}`; else `{ok:true, ops}`. Pure.
- `moneyEntriesToCsv(rows: MoneyEntryRow[]): string` — header `date,direction,amount,currency,category_id,merchant,description,tags,account_id`; one row per entry; `amount` = major units (`r.amount / (r.currency==='JPY'?1:100)`), 2-dp for non-JPY; `tags` = `(r.tags ?? []).join('; ')`; CSV-escape every field (wrap in double-quotes and double any internal `"` when the value contains `"`, `,`, or a newline). Pure. (Caller filters out deleted rows.)

- [ ] **Step 1: Failing tests** `data-export.test.ts` (build `Op` + `MoneyEntryRow` literals):
  - `buildBackup` → correct shape + op_count.
  - round-trip: `parseBackup(JSON.stringify(buildBackup(ops, iso)))` → `{ok:true, ops}` deep-equals the input ops.
  - `parseBackup('not json')` → `{ok:false}`; `parseBackup('{}')` (missing fields) → `{ok:false}`; a backup with one op missing a required field → `{ok:false}` with an error mentioning invalid entries.
  - `moneyEntriesToCsv`: amount 150000 INR → `1500.00`; a JPY 5000 → `5000`; a description containing a comma/quote is escaped (quoted, inner `"` doubled); tags joined with `; `; header present.
- [ ] **Step 2: Run fail → implement `data-export.ts`** (import `OpSchema`/`Op` from `@/types/ops`, `MoneyEntryRow` from `@/lib/dexie`) → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test data-export` → pass. **Step 4: Commit** named files.

---

### Task 2: `/settings/data` page + Settings link

**Files:**
- Create: `src/app/settings/data/page.tsx`
- Modify: `src/app/settings/page.tsx` (a "Data & backup" link)

- [ ] **Step 1: page** `settings/data/page.tsx` (mirror the `settings/accounts` auth shell). Three sections, each a card:
  - **Export backup (JSON):** a button → `const ops = (await db.op_log.toArray()).filter(o => o.user_id === userId)`; `const backup = buildBackup(ops as Op[], new Date().toISOString())`; download `pulse-backup-YYYY-MM-DD.json` (Blob `application/json`, temporary `<a download>`, revoke the object URL after). Show a muted "N entries" count (from `useLiveQuery(() => db.op_log.count())` or the fetched length).
  - **Export money (CSV):** a button → `const rows = (await db.money_entries.toArray()).filter(r => r.user_id === userId && !r.deleted_at)`; `moneyEntriesToCsv(rows)`; download `pulse-money-YYYY-MM-DD.csv` (Blob `text/csv`).
  - **Import backup:** an `<input type="file" accept=".json,application/json">`; on file chosen → `const text = await file.text()` (guard: reject > ~10 MB); `const res = parseBackup(text)`; if `!res.ok` → show `res.error`; else **confirm** ("Import N entries? This merges into your current data and can't remove anything.") → on confirm, `for (const op of res.ops) await applyLocalOp(op)`, then `await pushPullOnce({ userId })`, then show "Imported {ops.length} entries." Handle errors → a message. Disable the controls + show a spinner while working. A short note: "Import is safe — it merges by last-writer-wins and never deletes."
  - No `Date.now()` in render (timestamps built in the click handlers). 44px targets, aria-labels, file input labelled.
- [ ] **Step 2: settings link** add a 44px "Data & backup" entry in `settings/page.tsx`.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /settings/data). **Step 4: Commit** named files.

## Self-review

- **Coverage:** complete JSON backup export (T1 buildBackup + T2 download) · re-import via replay (T2, reusing applyLocalOp + pushPullOnce) · money CSV (T1 moneyEntriesToCsv + T2 download) · validation of uploaded files (T1 parseBackup). CSV-for-other-domains / destructive-import / encryption deferred. ✓
- **Placeholders:** none — helper signatures + test cases explicit; page wiring names the exact Dexie reads + sync fns.
- **Type consistency:** `Backup`/`buildBackup`/`parseBackup`/`moneyEntriesToCsv` (T1) consumed by the page (T2); reuses `Op`/`OpSchema`/`MoneyEntryRow`/`applyLocalOp`/`pushPullOnce`.
- **Guards:** import idempotent (applyLocalOp dedups by op id) + non-destructive (LWW, add/update only); malformed/oversized files rejected with a clear message; export filtered to this user; deleted money rows excluded from CSV.

## Post-merge

Verify prod `/app` + `/settings/data` 200. Owner: Settings → Data & backup → **Export backup** now (a reassuring one-tap backup after today's crash scare); keep the JSON file safe — Import restores/merges it on any device. (No D1 migration — nothing to apply.)
