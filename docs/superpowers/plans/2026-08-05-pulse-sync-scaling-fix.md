# Sync Scaling Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/api/sync` and `/api/admin/backfill` from hitting Cloudflare's Worker resource limit (1102) by bounding per-request DB work — incremental sync (O(new ops + delta)) + chunked backfill + a Settings "Rebuild server data" button.

**Architecture:** `/api/sync` replaces its full-op-log load with three bounded, index-backed queries (dedup by `id IN`, pull `hlc > cursor`, max via `ORDER BY hlc DESC LIMIT 1`) — same client contract, same output. `/api/admin/backfill` becomes cursor-paginated (`hlc > after LIMIT N`). A Settings button loops the chunked backfill from the app.

**Tech Stack:** Next 16 / TypeScript, Kysely + D1, Vitest. Reuses `idx_op_log_user_hlc ON op_log(user_id, hlc)` (migration 0001).

## Global Constraints

- **Client sync contract UNCHANGED**: `/api/sync` still accepts `{device_id, last_synced_hlc?, new_ops[]}` and returns `{server_hlc, new_ops_from_server, applied_ack}`. `src/lib/sync-client.ts` is NOT modified.
- **Correctness invariants (must hold):** (1) output-equivalence — same `newOps`, same `new_ops_from_server`, same `server_hlc` as the old full-load path; (2) `op_log.hlc` string order equals `compareHlc` order (locked by a unit test — a range query must never skip an op); (3) backfill idempotent (materializeRow upserts); (4) every query scoped `WHERE user_id = ?`.
- Per-request DB work must be O(new ops + delta), never O(total history).
- Sync materialize failures are logged + non-fatal (op_log already persisted; must not re-wedge sync).
- No new dependency, migration, or `entity_kind`. `materializeRow` is otherwise unchanged.
- Merging to `main` auto-deploys; verify CI + Deploy green + prod HTTP 200 + a real `/api/sync` POST returns 200 (not 503).
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Tests: `pnpm test`; typecheck: `pnpm exec tsc --noEmit`.
- **`git add` only the files each task names** — do NOT `git add -A`/`git commit -am` (unrelated untracked plan docs exist in the tree).

---

### Task 1: Pure sync helpers — `filterNewOps` + `orderOpsAfter` + hlc-order invariant

**Files:**
- Modify: `src/lib/sync-server.ts`
- Test: `tests/sync-server.test.ts`

**Interfaces:**
- Produces: `filterNewOps(incomingOps: Op[], existingIds: Set<string>): Op[]`; `orderOpsAfter(ops: Op[], cursor?: string): Op[]`. (`mergeOpsForUser` stays for now; Task 2 removes it once the route no longer imports it.)

- [ ] **Step 1: Write the failing tests**

Append to `tests/sync-server.test.ts` (keep the existing `mergeOpsForUser` describe block for now):

```ts
import { filterNewOps, orderOpsAfter } from '@/lib/sync-server'
import { compareHlc, parseHlc } from '@/lib/hlc'

describe('filterNewOps', () => {
  it('keeps only ops whose id is not in existingIds', () => {
    const incoming = [mkOp('a', '0000000000000001-000000-d1', {}), mkOp('b', '0000000000000002-000000-d1', {})]
    const out = filterNewOps(incoming, new Set(['a']))
    expect(out.map(o => o.id)).toEqual(['b'])
  })
  it('returns all when existingIds is empty', () => {
    const incoming = [mkOp('a', '0000000000000001-000000-d1', {})]
    expect(filterNewOps(incoming, new Set())).toHaveLength(1)
  })
})

describe('orderOpsAfter', () => {
  it('sorts by HLC ascending', () => {
    const ops = [mkOp('a', '0000000000000003-000000-d1', {}), mkOp('b', '0000000000000001-000000-d1', {}), mkOp('c', '0000000000000002-000000-d1', {})]
    expect(orderOpsAfter(ops).map(o => o.id)).toEqual(['b', 'c', 'a'])
  })
  it('filters to hlc > cursor when given', () => {
    const ops = [mkOp('a', '0000000000000001-000000-d1', {}), mkOp('b', '0000000000000003-000000-d1', {})]
    expect(orderOpsAfter(ops, '0000000000000002-000000-d1').map(o => o.id)).toEqual(['b'])
  })
})

describe('hlc string order == compareHlc order (invariant)', () => {
  it('lexicographic string comparison agrees with compareHlc across timestamp/counter/node', () => {
    const hlcs = [
      '0000000000000001-000000-d1',
      '0000000000000001-000001-d1',
      '0000000000000001-000001-d2',
      '0000000000000002-000000-d1',
      '0000000000000010-000000-aa',
    ]
    for (let i = 0; i < hlcs.length; i++) {
      for (let j = 0; j < hlcs.length; j++) {
        const strCmp = hlcs[i] < hlcs[j] ? -1 : hlcs[i] > hlcs[j] ? 1 : 0
        const hlcCmp = Math.sign(compareHlc(parseHlc(hlcs[i]), parseHlc(hlcs[j])))
        expect(hlcCmp).toBe(strCmp)
      }
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- sync-server`
Expected: FAIL — `filterNewOps`/`orderOpsAfter` not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/sync-server.ts`, add (keep `mergeOpsForUser` + its imports):

```ts
/** Dedup: which incoming ops the server does not already have (by id). */
export function filterNewOps(incomingOps: Op[], existingIds: Set<string>): Op[] {
  return incomingOps.filter(o => !existingIds.has(o.id))
}

/** The ops a client is missing: filter to hlc > cursor (if given), sorted by HLC. */
export function orderOpsAfter(ops: Op[], cursor?: string): Op[] {
  const filtered = cursor
    ? ops.filter(o => compareHlc(parseHlc(o.hlc), parseHlc(cursor)) > 0)
    : ops
  return [...filtered].sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- sync-server`
Expected: PASS (new blocks + the existing `mergeOpsForUser` block).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync-server.ts tests/sync-server.test.ts
git commit -m "feat: filterNewOps + orderOpsAfter pure helpers + hlc-order invariant test"
```

---

### Task 2: Incremental `/api/sync` route (bounded queries)

**Files:**
- Modify: `src/app/api/sync/route.ts:47-97`
- Modify: `src/lib/sync-server.ts` (remove now-unused `mergeOpsForUser`)
- Test: `tests/sync-integration.test.ts` (extend the MockDb; adapt), `tests/sync-server.test.ts` (drop the `mergeOpsForUser` block)

**Interfaces:**
- Consumes: `filterNewOps`, `orderOpsAfter` (Task 1); `materializeRow`.

- [ ] **Step 1: Extend the MockDb to support the new query shapes**

In `tests/sync-integration.test.ts`, replace `MockQueryBuilder` with a version that handles `in`/`>` where-ops, `orderBy`, `limit`, and `select` (projection is a passthrough — full rows are returned):

```ts
class MockQueryBuilder {
  private tableName: string
  private whereConditions: Array<[string, string, unknown]> = []
  private orderCol: string | null = null
  private orderDir: 'asc' | 'desc' = 'asc'
  private limitN: number | null = null

  constructor(tableName: string) { this.tableName = tableName }
  selectFrom(name: string) { this.tableName = name; return this }
  where(col: string, op: string, val: unknown) { this.whereConditions.push([col, op, val]); return this }
  select(_cols: string | string[]) { return this }   // projection passthrough
  selectAll() { return this }
  orderBy(col: string, dir: 'asc' | 'desc' = 'asc') { this.orderCol = col; this.orderDir = dir; return this }
  limit(n: number) { this.limitN = n; return this }

  async execute() {
    const table = mockDbInstance[this.tableName] || []
    let filtered = [...table]
    for (const [col, op, val] of this.whereConditions) {
      filtered = filtered.filter(row => {
        if (op === '=') return row[col] === val
        if (op === '>') return String(row[col]) > String(val)
        if (op === 'in') return (val as unknown[]).includes(row[col])
        return true
      })
    }
    if (this.orderCol) {
      const c = this.orderCol
      filtered.sort((a, b) => String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0)
      if (this.orderDir === 'desc') filtered.reverse()
    }
    if (this.limitN != null) filtered = filtered.slice(0, this.limitN)
    return filtered
  }
  async executeTakeFirst() { return (await this.execute())[0] || null }
}
```

- [ ] **Step 2: Add the failing assertions**

Add a test to `tests/sync-integration.test.ts` (inside a new describe) that locks the incremental behavior — no full-load regression:

```ts
describe('/api/sync — incremental (bounded)', () => {
  it('only returns ops newer than the client cursor, and dedups a re-pushed op', async () => {
    await withTestUser(async ({ userId, callSync }) => {
      const mk = (id: string, hlc: string) => ({
        id, hlc, device_id: 'd1', user_id: userId, entity_kind: 'money', entity_id: id,
        op_type: 'create' as const,
        payload: { amount: 100, currency: 'INR', direction: 'out' as const, occurred_at: '2026-08-01T00:00:00Z', source: 'manual' as const },
        schema_version: 1,
      })
      await callSync({ device_id: 'd1', new_ops: [mk('op-1', '0000000000000001-000000-d1')] })
      const push2 = await callSync({ device_id: 'd1', new_ops: [mk('op-2', '0000000000000002-000000-d1')] })
      expect(push2.applied_ack).toEqual(['op-2'])

      // Cursor after op-1 → pull returns only op-2 (not the whole log)
      const pull = await callSync({ device_id: 'd2', last_synced_hlc: '0000000000000001-000000-d1', new_ops: [] })
      expect(pull.new_ops_from_server.map((o: {id: string}) => o.id)).toEqual(['op-2'])

      // Re-pushing op-1 (already known) creates no duplicate; op_log stays 2
      await callSync({ device_id: 'd1', new_ops: [mk('op-1', '0000000000000001-000000-d1')] })
      const all = await callSync({ device_id: 'd3', new_ops: [] })
      expect(all.new_ops_from_server).toHaveLength(2)
      expect(pull.server_hlc).toBe('0000000000000002-000000-d1')
    })
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- sync-integration`
Expected: the new test FAILS (route still does the full-load path; `server_hlc`/cursor behavior differs) — and note whether the existing tests still pass (they should, since the contract is preserved after Step 4).

- [ ] **Step 4: Rewrite the route**

In `src/app/api/sync/route.ts`: change the import
```ts
import { mergeOpsForUser } from '@/lib/sync-server'
```
to
```ts
import { filterNewOps, orderOpsAfter } from '@/lib/sync-server'
```
Then replace everything from the `// Pull all existing ops` comment (line 47) through the `return NextResponse.json({...})` (the whole load + merge + persist + hlc block) with:

```ts
  const rowToOp = (row: typeof rowSample): Op => ({
    id: row.id, hlc: row.hlc, device_id: row.device_id, user_id: row.user_id,
    entity_kind: row.entity_kind as Op['entity_kind'], entity_id: row.entity_id,
    op_type: row.op_type as Op['op_type'],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    schema_version: row.schema_version,
  })

  // 1. Dedup incoming by id (bounded by |new_ops|).
  let existingIncomingIds = new Set<string>()
  if (new_ops.length > 0) {
    const rows = await db.selectFrom('op_log')
      .where('user_id', '=', userId)
      .where('id', 'in', new_ops.map(o => o.id))
      .select('id')
      .execute()
    existingIncomingIds = new Set(rows.map(r => r.id))
  }
  const newOps = filterNewOps(new_ops, existingIncomingIds)

  // 2. Persist + materialize each genuinely-new op (bounded by |newOps|).
  //    op_log is the source of truth; a materialize (projection) failure is
  //    logged, not fatal — one bad op must never re-wedge sync.
  for (const op of newOps) {
    await db.insertInto('op_log').values({
      id: op.id, user_id: op.user_id, hlc: op.hlc, device_id: op.device_id,
      entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type,
      payload: JSON.stringify(op.payload), schema_version: op.schema_version, applied_at: Date.now(),
    }).onConflict(oc => oc.column('id').doNothing()).execute()
    try {
      await materializeRow(db, op, userId)
    } catch (err) {
      console.error('sync materialize failed', op.id, op.entity_kind, (err as Error).message)
    }
  }

  // 3. Pull the delta the client is missing (bounded by delta; no cursor = one-time bootstrap).
  let pull = db.selectFrom('op_log').where('user_id', '=', userId)
  if (last_synced_hlc) pull = pull.where('hlc', '>', last_synced_hlc)
  const deltaRows = await pull.orderBy('hlc', 'asc').selectAll().execute()
  const opsForClient = orderOpsAfter(deltaRows.map(rowToOp), last_synced_hlc)

  // 4. Cursor = max HLC (ORDER BY hlc DESC LIMIT 1 — index-backed, no aggregate).
  const maxRow = await db.selectFrom('op_log')
    .where('user_id', '=', userId)
    .orderBy('hlc', 'desc').limit(1)
    .select('hlc').executeTakeFirst()
  const serverHlc = maxRow?.hlc ?? '0000000000000000-000000-server'

  return NextResponse.json({
    server_hlc: serverHlc,
    new_ops_from_server: opsForClient,
    applied_ack: new_ops.map(o => o.id),
  })
```

Add a `rowSample` type alias near the top of the function (or type `row` inline) so `rowToOp` typechecks — the simplest is to type the param as the op_log row shape inline:
```ts
  type OpLogRow = { id: string; hlc: string; device_id: string; user_id: string; entity_kind: string; entity_id: string; op_type: string; payload: string; schema_version: number }
```
and use `(row: OpLogRow)` in `rowToOp` (drop the `rowSample` reference). Remove the now-unused `existingOps`/`mergeOpsForUser`/`allHlcs` code.

- [ ] **Step 5: Remove the now-unused `mergeOpsForUser`**

In `src/lib/sync-server.ts` delete the `mergeOpsForUser` function + the `MergeResult` type (keep `filterNewOps`/`orderOpsAfter` + the `compareHlc`/`parseHlc` imports). In `tests/sync-server.test.ts` delete the `describe('mergeOpsForUser', …)` block + its `mergeOpsForUser` import (keep the Task-1 blocks).

- [ ] **Step 6: Run the full sync test suite**

Run: `pnpm test -- sync-integration sync-server sync-client`
Expected: PASS — the new incremental test, all pre-existing `sync-integration` entity-kind tests (money/category/recurring/task/insight/learning/note incl. tags LWW), and `sync-client` all green. Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sync/route.ts src/lib/sync-server.ts tests/sync-integration.test.ts tests/sync-server.test.ts
git commit -m "fix(sync): incremental /api/sync (bounded queries) — no more Worker resource-limit 1102"
```

---

### Task 3: Chunked `/api/admin/backfill`

**Files:**
- Modify: `src/app/api/admin/backfill/route.ts`
- Test: `tests/api/backfill-route.test.ts` (create)

**Interfaces:**
- Produces: `POST /api/admin/backfill` accepting `{ after?: string, limit?: number }`, returning `{ ok, processed, next_after, done, by_kind, errors }`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/backfill-route.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
let opLog: Row[] = []
const materialized: string[] = []

function makeFakeDb() {
  return {
    selectFrom: () => {
      const conds: Array<[string, string, unknown]> = []
      let orderDir: 'asc' | 'desc' = 'asc'; let lim: number | null = null
      const b: any = {
        where: (c: string, o: string, v: unknown) => { conds.push([c, o, v]); return b },
        orderBy: (_c: string, d: 'asc' | 'desc' = 'asc') => { orderDir = d; return b },
        limit: (n: number) => { lim = n; return b },
        selectAll: () => b,
        execute: async () => {
          let rows = opLog.filter(r => conds.every(([c, o, v]) =>
            o === '=' ? r[c] === v : o === '>' ? String(r[c]) > String(v) : true))
          rows.sort((x, y) => String(x.hlc) < String(y.hlc) ? -1 : 1)
          if (orderDir === 'desc') rows.reverse()
          if (lim != null) rows = rows.slice(0, lim)
          return rows
        },
      }
      return b
    },
  } as any
}
let currentDb: any
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null } }) }))
vi.mock('@/lib/db', () => ({ createDb: () => currentDb }))
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/materialize', () => ({ materializeRow: vi.fn(async (_db: unknown, op: { id: string }) => { materialized.push(op.id) }) }))

const { POST } = await import('@/app/api/admin/backfill/route')

function req(body: unknown) {
  return new Request('http://x/api/admin/backfill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
function mkRow(id: string, hlc: string): Row {
  return { id, hlc, device_id: 'd1', user_id: 'u1', entity_kind: 'money', entity_id: id, op_type: 'create', payload: '{}', schema_version: 1 }
}

describe('POST /api/admin/backfill (chunked)', () => {
  beforeEach(() => {
    opLog = [mkRow('a', '0000000000000001-000000-d1'), mkRow('b', '0000000000000002-000000-d1'), mkRow('c', '0000000000000003-000000-d1')]
    materialized.length = 0
    currentDb = makeFakeDb()
  })

  it('processes at most `limit` ops and reports next_after + not-done', async () => {
    const res = await POST(req({ limit: 2 }))
    const body = await res.json() as { processed: number; next_after: string; done: boolean }
    expect(body.processed).toBe(2)
    expect(body.next_after).toBe('0000000000000002-000000-d1')
    expect(body.done).toBe(false)
    expect(materialized).toEqual(['a', 'b'])
  })

  it('continues after a cursor and reports done on the last page', async () => {
    const res = await POST(req({ after: '0000000000000002-000000-d1', limit: 2 }))
    const body = await res.json() as { processed: number; done: boolean }
    expect(body.processed).toBe(1)
    expect(body.done).toBe(true)
    expect(materialized).toEqual(['c'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- backfill-route`
Expected: FAIL — the route still replays ALL ops (ignores `limit`/`after`).

- [ ] **Step 3: Rewrite the backfill route**

Replace the body of `POST` in `src/app/api/admin/backfill/route.ts` (keep the session-auth guard + `getCloudflareContext`/`createDb` setup) with a chunked version:

```ts
  let body: { after?: unknown; limit?: unknown } = {}
  try { body = (await req.json()) ?? {} } catch { /* empty body ok */ }
  const after = typeof body.after === 'string' ? body.after : undefined
  const limit = Math.min(typeof body.limit === 'number' && body.limit > 0 ? Math.floor(body.limit) : 20, 50)

  let q = db.selectFrom('op_log').where('user_id', '=', userId)
  if (after) q = q.where('hlc', '>', after)
  const rows = await q.orderBy('hlc', 'asc').limit(limit).selectAll().execute()

  const byKind: Record<string, number> = {}
  const errors: Array<{ op_id: string; entity_kind: string; error: string }> = []
  for (const row of rows) {
    const op: Op = {
      id: row.id, hlc: row.hlc, device_id: row.device_id, user_id: row.user_id,
      entity_kind: row.entity_kind as Op['entity_kind'], entity_id: row.entity_id,
      op_type: row.op_type as Op['op_type'],
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      schema_version: row.schema_version,
    }
    try {
      await materializeRow(db, op, userId)
      byKind[op.entity_kind] = (byKind[op.entity_kind] ?? 0) + 1
    } catch (err) {
      errors.push({ op_id: op.id, entity_kind: op.entity_kind, error: (err as Error).message })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    next_after: rows.length > 0 ? rows[rows.length - 1].hlc : (after ?? null),
    done: rows.length < limit,
    by_kind: byKind,
    errors,
  })
```

Update the file's leading comment to say it is chunked/cursor-paginated (the client loops until `done`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- backfill-route`
Expected: PASS (both chunk tests). Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/backfill/route.ts tests/api/backfill-route.test.ts
git commit -m "fix(backfill): cursor-paginated chunked replay (stays under Worker limits)"
```

---

### Task 4: Settings "Rebuild server data" button

**Files:**
- Create: `src/lib/backfill-driver.ts` (pure loop helper) + `tests/lib/backfill-driver.test.ts`
- Modify: `src/app/settings/page.tsx` (add a card/section) — OR create `src/app/settings/rebuild/page.tsx`
- (Follow the existing Settings pattern; a small client component with a button.)

**Interfaces:**
- Consumes: `POST /api/admin/backfill` (Task 3).

- [ ] **Step 1: Pure driver helper + test**

Create `src/lib/backfill-driver.ts`:

```ts
export type BackfillPage = { processed: number; next_after: string | null; done: boolean; errors: unknown[] }

/**
 * Drive the chunked backfill to completion. `postPage(after)` performs one
 * POST /api/admin/backfill and returns its JSON. Loops until `done` or the
 * iteration cap (runaway guard). Pure w.r.t. the injected postPage.
 */
export async function runBackfill(
  postPage: (after: string | undefined) => Promise<BackfillPage>,
  maxIterations = 200,
): Promise<{ totalProcessed: number; totalErrors: number; completed: boolean; iterations: number }> {
  let after: string | undefined = undefined
  let totalProcessed = 0, totalErrors = 0, iterations = 0
  while (iterations < maxIterations) {
    const page = await postPage(after)
    iterations++
    totalProcessed += page.processed
    totalErrors += page.errors.length
    if (page.done || !page.next_after) return { totalProcessed, totalErrors, completed: true, iterations }
    after = page.next_after
  }
  return { totalProcessed, totalErrors, completed: false, iterations }
}
```

Create `tests/lib/backfill-driver.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runBackfill } from '@/lib/backfill-driver'

describe('runBackfill', () => {
  it('loops pages until done, accumulating totals', async () => {
    const pages = [
      { processed: 2, next_after: 'h2', done: false, errors: [] },
      { processed: 2, next_after: 'h4', done: false, errors: [{}] },
      { processed: 1, next_after: 'h5', done: true, errors: [] },
    ]
    let i = 0
    const r = await runBackfill(async () => pages[i++])
    expect(r).toEqual({ totalProcessed: 5, totalErrors: 1, completed: true, iterations: 3 })
  })
  it('stops at the iteration cap if never done (runaway guard)', async () => {
    const r = await runBackfill(async () => ({ processed: 1, next_after: 'h', done: false, errors: [] }), 5)
    expect(r.completed).toBe(false)
    expect(r.iterations).toBe(5)
  })
})
```

- [ ] **Step 2: Run the driver tests (fail → implement → pass)**

Run: `pnpm test -- backfill-driver`
Expected: FAIL (module missing) → after creating the file, PASS.

- [ ] **Step 3: Add the Settings UI (presentational — no render harness; verify via build)**

Add a "Rebuild server data" control in Settings (follow `src/app/settings/page.tsx`'s existing card/link pattern; if adding a dedicated page, mirror `settings/sms-import/page.tsx`'s client-component shape). The button handler calls `runBackfill(after => fetch('/api/admin/backfill', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ after }) }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }))`, disables while running, and renders the returned `{ totalProcessed, totalErrors, completed }` as "Rebuilt N ops ✓" / "…N errors" / "stopped early". Copy: title "Rebuild server data", one-line description "Re-sync your history into the server tables (fixes stale budgets/insights). Safe to run anytime."

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm exec tsc --noEmit` (exit 0), then `pnpm build` (success).

- [ ] **Step 5: Commit**

```bash
git add src/lib/backfill-driver.ts tests/lib/backfill-driver.test.ts src/app/settings/
git commit -m "feat: Rebuild server data button (loops the chunked backfill from the app)"
```

---

### Task 5: QA runbook

**Files:**
- Create: `docs/superpowers/notes/2026-08-05-pulse-sync-scaling-qa-runbook.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Sync scaling fix — QA Runbook (on-device + prod)

## Sync no longer 503s
1. After deploy, on the app: open the console (desktop) or just use the app — `/api/sync` should return 200 (was 503 "Worker exceeded resource limits" / error 1102).
2. Prod smoke: an unauthenticated `POST /api/sync` returns 400/401 (not 503); an authed sync returns 200 with `{server_hlc, new_ops_from_server, applied_ack}`.
3. Make a change on the device (add an entry) → it appears server-side within a sync cycle (server tables grow).

## Rebuild server data
4. Settings → Rebuild server data → tap. It loops the chunked backfill; shows "Rebuilt N ops ✓" (N ≈ your op count, ~255) or "…with M errors".
5. Verify server-side (owner/query): categories jump from 5 → 14 canonical (incl. Salary), money entries → your full set.
6. Re-running is safe (idempotent) — a second run rebuilds to the same state.

## Notes
- No migration/dep. Reuses idx_op_log_user_hlc. Client sync contract unchanged.
- Per-request work is now O(new ops + delta), so sync scales with history.
- Chunk size default 20 (cap 50) keeps each backfill request under the Worker subrequest limit.
- Sync materialize failures are logged + non-fatal (op_log is the source of truth); a bad op no longer wedges sync — it re-materializes on the next Rebuild.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-08-05-pulse-sync-scaling-qa-runbook.md
git commit -m "docs: QA runbook for the sync scaling fix"
```

---

## After all tasks

- Full `pnpm test` + `pnpm build` green; `pnpm exec tsc --noEmit` clean.
- **Opus whole-branch review** (correctness-critical: verify output-equivalence, the hlc-order reliance, no client-contract drift, backfill idempotency, tenant scoping, and that the sync materialize try/catch can't hide a real data bug).
- finishing-a-development-branch → merge `sync-scaling-fix` to `main` (auto-deploys). Verify CI + Deploy green + prod 200 + a real `/api/sync` returns 200 (not 503).
- Owner: on the laptop, confirm the app syncs (no 503 in console); then Settings → Rebuild server data; I'll re-query the server to confirm categories 5→14 + money → full set.
