# Pulse — Sync scaling fix (incremental sync + chunked backfill) (design)

**Date:** 2026-08-05
**Status:** approved for planning

## Problem

`/api/sync` and `/api/admin/backfill` both fail with Cloudflare **error 1102 "Worker exceeded resource limits"** (confirmed in prod). Root cause: `/api/sync` (`src/app/api/sync/route.ts:47`, self-flagged "full table for Phase 0") loads the caller's **entire op_log** every request, JSON-parses all of it, merges in memory, then loops `materializeRow` (2–3 D1 subrequests) per new op. At ~255 ops this per-request work (O(total history)) crosses the Worker limit, so **every sync 503s** — Sheik's device data is safe locally but not reaching the server, leaving the server materialized tables stale (only 2 money entries, 0 canonical categories) and the budget/digest crons computing on stale data. The one-time backfill (252 ops × 2 D1 calls in one request) blows the limit even harder, so it can never complete.

## Goals

1. **Incremental `/api/sync`:** bound per-request work to O(new ops + delta), not O(history), so sync stops 503-ing and scales as history grows. **Server-only change; the client contract is unchanged.**
2. **Chunked `/api/admin/backfill`:** process a bounded page of ops per request (cursor-paginated), so it completes within limits.
3. **"Rebuild server data" button** (Settings): loops the chunked backfill from within the app (session-authed → works on iPhone), reconciling the stale server tables.

## Non-goals (YAGNI)

- Paginating the sync **bootstrap pull** (a brand-new device pulling all ~255 ops in one `SELECT` is fine at this scale — it's one query, no per-op loop; revisit only at much larger histories).
- Any change to the **client sync contract** (`pushPullOnce` already sends `last_synced_hlc` + `new_ops` and consumes `{server_hlc, new_ops_from_server, applied_ack}`).
- No new dependency, migration, or `entity_kind`. The needed index `idx_op_log_user_hlc ON op_log(user_id, hlc)` already exists (migration 0001).

## Architecture

### Part A — incremental `/api/sync` (server-only)

Replace the full-table load + in-memory merge with bounded, index-backed queries that preserve the exact `mergeOpsForUser` semantics:

1. **Dedup incoming** (which pushed ops are new): `SELECT id FROM op_log WHERE user_id = ? AND id IN (<incoming ids>)` → `existingIncomingIds` (Set). `newOps = incomingOps.filter(o => !existingIncomingIds.has(o.id))`. Bounded by |incoming|. (Skip the query entirely if `incomingOps` is empty.)
2. **Persist + materialize** each `newOp`: `op_log` insert (with `.onConflict(id).doNothing()` for safety) + `materializeRow`. The materialize call is wrapped in try/catch — a projection failure is logged and does NOT abort the sync (op_log is the source of truth; a single bad op must never re-wedge sync). Bounded by |newOps|.
3. **Pull delta** (ops the client is missing): `SELECT * FROM op_log WHERE user_id = ? AND hlc > ? ORDER BY hlc` with `?` = `last_synced_hlc` (omit the `hlc >` clause when the client sends no cursor — the one-time bootstrap). This runs AFTER step 2, so it already includes the just-inserted `newOps` whose `hlc > cursor` — identical to the old `opsForClient`.
4. **Cursor:** `server_hlc = SELECT MAX(hlc) AS m FROM op_log WHERE user_id = ?` (falls back to the sentinel `'0000000000000000-000000-server'` when the table is empty).
5. **Response:** `{ server_hlc, new_ops_from_server: <delta from step 3>, applied_ack: incomingOps.map(o => o.id) }` — same shape the client already expects.

Per-request D1 work: `1 (dedup) + |newOps|×~3 (insert+materialize) + 1 (pull) + 1 (max)` = **O(new ops + delta)**.

**`mergeOpsForUser` refactor:** split its two conflated concerns into small pure helpers so they stay unit-tested:
- `filterNewOps(incomingOps: Op[], existingIds: Set<string>): Op[]` — the dedup (step 1).
- `orderOpsAfter(ops: Op[], cursor?: string): Op[]` — sort by `compareHlc` and, when a cursor is given, keep `compareHlc(op, cursor) > 0`. Applied in-memory to the **bounded** delta from step 3 as an exactness backstop (see invariant 2). Replaces the old in-memory `opsForClient` computation.

### Part B — chunked `/api/admin/backfill`

Body `{ after?: string, limit?: number }` (both optional; default `limit = 20`, hard-capped e.g. `Math.min(limit, 50)`). Session-authed (unchanged). Logic:
- `SELECT * FROM op_log WHERE user_id = ? AND hlc > <after> ORDER BY hlc LIMIT <limit>` (omit `hlc >` when `after` absent).
- `materializeRow` each (try/catch → collect `errors`, as today).
- Response: `{ ok: true, processed: <rows.length>, next_after: <last row's hlc | null>, done: <rows.length < limit>, by_kind, errors }`.
- Idempotent (upserts) → safe to re-page / retry.

### Part C — "Rebuild server data" button (Settings)

A new Settings entry/section with a **Rebuild server data** button. On tap it loops Part B: start with `after = undefined`, then `after = next_after`, until `done` (cap the loop, e.g. ≤200 iterations, as a runaway guard). It accumulates `processed` + `errors` and shows progress ("Rebuilt N…") and a final result ("Rebuilt 255 ops ✓" or "…with M errors"). Session cookie is sent automatically (same-origin fetch from the app), so it works on iPhone. Pure `nextBackfillCursor`/accumulator logic where testable; the fetch-loop wiring is presentational.

## Data flow

```
SYNC (per call):  client → {last_synced_hlc, new_ops}
  → dedup incoming (id IN …) → newOps
  → insert+materialize newOps (bounded, materialize errors logged not fatal)
  → pull delta (hlc > cursor ORDER BY hlc)
  → server_hlc = MAX(hlc)
  → {server_hlc, new_ops_from_server: delta, applied_ack}   [same contract]

REBUILD (Settings button):  loop
  POST /api/admin/backfill {after}  → {processed, next_after, done, errors}
  until done → show "Rebuilt <total> ✓ (errors: <n>)"
```

## Correctness invariants (must hold; tested)

1. **Output-equivalence:** for the same inputs, the incremental sync returns the SAME `newOps` set, the SAME `opsForClient`/delta, and the SAME `server_hlc` as the old full-load path (verified by adapting `sync-integration.test.ts`).
2. **hlc string order == `compareHlc` order.** The `WHERE hlc > cursor` range query and `MAX(hlc)` rely on lexicographic TEXT ordering equaling `compareHlc` (the codebase already assumes this for `server_hlc` and the index). A unit test locks this for representative hlcs (varying timestamp, counter, node) so a range query can never silently skip an op. The in-memory `orderOpsAfter` backstop re-applies `compareHlc` to the bounded delta.
3. **Backfill idempotency:** `materializeRow` upserts; paging by `hlc` with `ORDER BY hlc LIMIT N` + `after = last hlc` is stable and safe to retry.
4. **Tenant isolation:** every query is scoped `WHERE user_id = ?`; the sync op authorization check (`op.user_id === userId`) is unchanged.

## Error handling

- **Sync materialize failure:** logged, non-fatal (op_log insert already succeeded); the op re-materializes on the next backfill/rebuild. Prevents one bad op from wedging sync.
- **Backfill per-op failure:** collected into `errors[]` (unchanged); the page still returns so the loop continues.
- **Rebuild loop:** stops on `done`, on a non-2xx response (surfaces the status), or at the iteration cap; shows whatever it accumulated.

## Testing

- **Pure:** `filterNewOps`, `orderOpsAfter`, and the hlc-ordering invariant test — unit tested (adapt `sync-server.test.ts`).
- **`/api/sync` route:** fake-DB test asserting dedup uses an `id IN` query (not a full load), materialize runs only for new ops, the delta pull uses `hlc > cursor`, `server_hlc = MAX(hlc)`, and the response shape/`applied_ack` are unchanged. Adapt `sync-integration.test.ts` (the fake DB gains `id IN` / `hlc >` / `MAX` support) — existing sync behavior assertions must still pass.
- **`/api/admin/backfill` route:** processes ≤ `limit`, returns correct `next_after` + `done`, collects `errors`, idempotent on re-run.
- **`sync-client.test.ts`** must stay green (client contract unchanged).
- The Rebuild button is presentational (no render harness) → `tsc` + `build` + QA runbook.
- Full `pnpm test` + `pnpm build` green; **opus whole-branch review** (correctness-critical).

## Global constraints

- Client sync contract unchanged; server-only for Part A.
- No new dependency, migration, or `entity_kind`; reuse `idx_op_log_user_hlc`.
- `materializeRow` behavior otherwise unchanged (still the shared projection).
- Merging to `main` auto-deploys; verify CI + Deploy green + prod HTTP 200 + a real `/api/sync` returns 200 (not 503) afterward.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
