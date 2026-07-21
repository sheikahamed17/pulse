# Pulse Insights View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn weekly digests into a browsable reflection surface — a `/insights` history + per-insight detail + a user-triggered "generate/refresh this week" — reusing the existing insight entity + digest generation.

**Architecture:** Extract the digest cron's generation into a shared `generateInsight` core that both the cron and a new session-auth'd `POST /api/insights/generate` call, materializing via `materializeRow` LWW so cron + on-demand + client converge. A `/insights` route lists insights (reusing an extracted `InsightCard`), `/insights/[id]` shows detail.

**Tech Stack:** Next 16 / React 19 / Kysely-D1 / Groq / Dexie. Spec: `docs/superpowers/specs/2026-07-21-pulse-insights-view-design.md`.

## Global Constraints

- **Read the spec** — it governs. **No new `entity_kind` / Dexie store / D1 migration / op-schema change / cron trigger / dependency** (the `insight` entity + its `materializeRow`/`applyLocalOp` cases + Dexie `insights` store all already exist).
- Both cron AND on-demand write an insight op and materialize via **`materializeRow(db, op, userId)`** (LWW, newest HLC wins) — replacing the cron's current manual `onConflict doNothing` insert. This is required for server↔client convergence.
- `entity_id = insight-{userId}-{weekStartDate}` (YYYY-MM-DD of `bounds.startsAt`) — stable per week. Op `id` (op_log PK) is unique per generation: cron `insight-weekly-{userId}-{weekStart}` (idempotent, existing check kept); on-demand `insight-ondemand-{userId}-{weekStart}-{Date.now()}`. `hlc = serverHlcFor(nowIso)`; `device_id: 'cron'`.
- On-demand LLM is best-effort: `fallbackSummary(metrics)` on any Groq error or when `groq` is null (never 500 on quota). The generate button is disabled while generating (no rapid double-fire).
- Client pages get the user via `authClient.getSession()` → redirect `/login` if absent (match `settings/preferences`). Server route uses `getSession(req)` + `getCloudflareContext` + `createDb` + `makeGroqClient` (match `api/agent`).
- Dark-glass + a11y (buttons labeled, ≥44px, focus-visible; generate button announces busy).
- **Gate every task, run UN-CHAINED:** `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` (baseline **712**; grows). Git identity `sdsheikahamed@gmail.com`. Branch `feature/insights-view` (spec @ `81687f1`).

---

## File Structure

**Create:** `src/lib/insight-generate.ts` (`generateInsight`), `src/hooks/use-insights.ts` (`useInsights`), `src/components/insight-card.tsx` (`InsightCard`), `src/app/api/insights/generate/route.ts`, `src/app/insights/page.tsx`, `src/app/insights/[id]/page.tsx`. Tests: `tests/lib/insight-generate.test.ts`, `tests/api/insights-generate-route.test.ts`, additions to `tests/digest-window.test.ts`.
**Modify:** `src/lib/digest-window.ts` (`currentWeekBounds`), `src/app/api/cron/digest/route.ts` (call `generateInsight`), `src/components/digest-card.tsx` (render `InsightCard`), `src/app/settings/page.tsx` (Insights nav entry), `tests/api/cron-digest-route.test.ts` (regression stays green).

---

## Task 1: `currentWeekBounds` + shared `generateInsight` core + digest-cron refactor

**Files:**
- Modify: `src/lib/digest-window.ts`, `src/app/api/cron/digest/route.ts`, `tests/digest-window.test.ts`, `tests/api/cron-digest-route.test.ts`
- Create: `src/lib/insight-generate.ts`, `tests/lib/insight-generate.test.ts`

**Interfaces — Produces:**
- `currentWeekBounds(nowIso: string, tz: string): { startsAt: string; endsAt: string }` (this week's local Monday 00:00 → `nowIso`).
- `generateInsight(args): Promise<{ skipped: boolean; insight: InsightRow | null }>` where `args = { db: Kysely<DB>; groq: Groq | null; userId: string; bounds: { startsAt: string; endsAt: string }; primaryCurrency: string; nowIso: string; opId: string; opType: 'create' | 'update' }`. Skips (returns `{skipped:true, insight:null}`) on an empty week. Inserts op_log + `materializeRow` (LWW). Does NOT push (the cron keeps push).

- [ ] **Step 1: `currentWeekBounds` failing test — add to `tests/digest-window.test.ts`:**
```typescript
import { currentWeekBounds } from '@/lib/digest-window'

describe('currentWeekBounds', () => {
  it('starts at this week\'s local Monday 00:00 and ends now (IST)', () => {
    // 2026-07-22T06:00:00Z is Wed 11:30 IST → this week's Monday = 2026-07-20 00:00 IST = 2026-07-19T18:30:00Z
    const now = '2026-07-22T06:00:00.000Z'
    const b = currentWeekBounds(now, 'Asia/Kolkata')
    expect(b.startsAt).toBe('2026-07-19T18:30:00.000Z')
    expect(b.endsAt).toBe(now)
  })
  it('on Monday, starts today', () => {
    // 2026-07-20T04:00:00Z = Mon 09:30 IST → Monday start = 2026-07-19T18:30:00Z
    const now = '2026-07-20T04:00:00.000Z'
    const b = currentWeekBounds(now, 'Asia/Kolkata')
    expect(b.startsAt).toBe('2026-07-19T18:30:00.000Z')
    expect(b.endsAt).toBe(now)
  })
})
```

- [ ] **Step 2: run → FAIL** (`pnpm test tests/digest-window.test.ts`).

- [ ] **Step 3: implement `currentWeekBounds` in `src/lib/digest-window.ts`** (append; reuses the module-private `localParts`/`localWallClockToUtc`):
```typescript
/**
 * The IN-PROGRESS local week, as UTC ISO boundaries: startsAt = this week's
 * Monday 00:00 local; endsAt = now (week-to-date). Companion to priorWeekBounds.
 */
export function currentWeekBounds(nowIso: string, tz: string): { startsAt: string; endsAt: string } {
  const p = localParts(nowIso, tz)
  const sinceMonday = p.weekday === 0 ? 6 : p.weekday - 1
  const curMon = new Date(Date.UTC(p.year, p.month - 1, p.day))
  curMon.setUTCDate(curMon.getUTCDate() - sinceMonday)
  return {
    startsAt: localWallClockToUtc(curMon.getUTCFullYear(), curMon.getUTCMonth() + 1, curMon.getUTCDate(), 0, 0, tz),
    endsAt: nowIso,
  }
}
```

- [ ] **Step 4: run → PASS.** (If the exact expected ISO differs by tz math, adjust the test's expected value to the computed boundary — the property is "Monday 00:00 IST as UTC" + "endsAt === now".)

- [ ] **Step 5: `generateInsight` failing test — `tests/lib/insight-generate.test.ts`** (mock aggregate + narrative + materialize; a chainable fake db capturing the op_log insert):
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const aggregateWeek = vi.fn()
const writeDigestNarrative = vi.fn()
const fallbackSummary = vi.fn(() => 'FALLBACK')
const materializeRow = vi.fn()
vi.mock('@/lib/digest-aggregate', () => ({ aggregateWeek }))
vi.mock('@/lib/agents/digest-agent', () => ({ writeDigestNarrative, fallbackSummary }))
vi.mock('@/lib/materialize', () => ({ materializeRow }))

const opInserts: any[] = []
const fakeDb = {
  insertInto: () => ({ values: (v: any) => ({ execute: async () => { opInserts.push(v) } }) }),
  selectFrom: () => ({ where: function () { return this }, selectAll: function () { return this }, select: function () { return this }, executeTakeFirst: async () => ({ id: 'insight-u1-2026-07-19', summary: 'S', metrics: '{}' }) }),
} as any

const { generateInsight } = await import('@/lib/insight-generate')

const metrics = { currency: 'INR', spend_total: 100, income_total: 0, top_categories: [], tasks_completed: 0, tasks_created: 1, tasks_overdue: 0, skipped_currencies: [], entry_count: 3 }
const baseArgs = () => ({ db: fakeDb, groq: {} as any, userId: 'u1', bounds: { startsAt: '2026-07-19T18:30:00.000Z', endsAt: '2026-07-22T06:00:00.000Z' }, primaryCurrency: 'INR', nowIso: '2026-07-22T06:00:00.000Z', opId: 'insight-ondemand-u1-2026-07-19-123', opType: 'create' as const })

describe('generateInsight', () => {
  beforeEach(() => { vi.clearAllMocks(); opInserts.length = 0; fallbackSummary.mockReturnValue('FALLBACK') })

  it('skips an empty week (no op written)', async () => {
    aggregateWeek.mockResolvedValue({ ...metrics, entry_count: 0, tasks_created: 0, tasks_completed: 0 })
    const r = await generateInsight(baseArgs())
    expect(r.skipped).toBe(true)
    expect(opInserts).toHaveLength(0)
    expect(materializeRow).not.toHaveBeenCalled()
  })
  it('creates: writes an op_log row with the given opId + entity_id and materializes', async () => {
    aggregateWeek.mockResolvedValue(metrics)
    writeDigestNarrative.mockResolvedValue('NARRATIVE')
    const r = await generateInsight(baseArgs())
    expect(r.skipped).toBe(false)
    expect(opInserts).toHaveLength(1)
    expect(opInserts[0].id).toBe('insight-ondemand-u1-2026-07-19-123')
    expect(opInserts[0].entity_kind).toBe('insight')
    expect(opInserts[0].entity_id).toBe('insight-u1-2026-07-19')
    expect(opInserts[0].op_type).toBe('create')
    expect(materializeRow).toHaveBeenCalledOnce()
  })
  it('falls back to fallbackSummary when the narrative LLM throws', async () => {
    aggregateWeek.mockResolvedValue(metrics)
    writeDigestNarrative.mockRejectedValue(new Error('groq 429'))
    await generateInsight(baseArgs())
    const payload = JSON.parse(opInserts[0].payload)
    expect(payload.summary).toBe('FALLBACK')
  })
  it('uses fallbackSummary when groq is null (no LLM call)', async () => {
    aggregateWeek.mockResolvedValue(metrics)
    await generateInsight({ ...baseArgs(), groq: null })
    expect(writeDigestNarrative).not.toHaveBeenCalled()
    expect(JSON.parse(opInserts[0].payload).summary).toBe('FALLBACK')
  })
})
```

- [ ] **Step 6: run → FAIL.**

- [ ] **Step 7: implement `src/lib/insight-generate.ts`:**
```typescript
import type Groq from 'groq-sdk'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'
import type { InsightRow } from '@/lib/dexie'
import type { Op } from '@/types/ops'
import { aggregateWeek } from '@/lib/digest-aggregate'
import { writeDigestNarrative, fallbackSummary } from '@/lib/agents/digest-agent'
import { materializeRow } from '@/lib/materialize'
import { serverHlcFor } from '@/lib/server-hlc'

export type GenerateInsightArgs = {
  db: Kysely<DB>
  groq: Groq | null
  userId: string
  bounds: { startsAt: string; endsAt: string }
  primaryCurrency: string
  nowIso: string
  opId: string
  opType: 'create' | 'update'
}

export async function generateInsight(args: GenerateInsightArgs): Promise<{ skipped: boolean; insight: InsightRow | null }> {
  const { db, groq, userId, bounds, primaryCurrency, nowIso, opId, opType } = args

  const metrics = await aggregateWeek(db, userId, bounds, primaryCurrency)
  if (metrics.entry_count === 0 && metrics.tasks_created === 0 && metrics.tasks_completed === 0) {
    return { skipped: true, insight: null }
  }

  const weekLabel = `week of ${bounds.startsAt.slice(0, 10)} to ${bounds.endsAt.slice(0, 10)}`
  let summary = ''
  if (groq) {
    try {
      summary = await writeDigestNarrative({ client: groq, metrics, weekLabel })
    } catch {
      summary = fallbackSummary(metrics)
    }
  } else {
    summary = fallbackSummary(metrics)
  }

  const entityId = `insight-${userId}-${bounds.startsAt.slice(0, 10)}`
  const op: Op = {
    id: opId,
    hlc: serverHlcFor(nowIso),
    device_id: 'cron',
    user_id: userId,
    entity_kind: 'insight',
    entity_id: entityId,
    op_type: opType,
    payload: {
      period: 'weekly',
      starts_at: bounds.startsAt,
      ends_at: bounds.endsAt,
      summary,
      metrics: JSON.stringify(metrics),
    },
    schema_version: 1,
  }

  await db.insertInto('op_log').values({
    id: op.id, user_id: op.user_id, hlc: op.hlc, device_id: op.device_id,
    entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type,
    payload: JSON.stringify(op.payload), schema_version: op.schema_version, applied_at: Date.now(),
  }).execute()

  await materializeRow(db, op, userId)

  const insight = await db.selectFrom('insights').where('id', '=', entityId).selectAll().executeTakeFirst()
  return { skipped: false, insight: (insight as InsightRow | undefined) ?? null }
}
```

- [ ] **Step 8: run → PASS.**

- [ ] **Step 9: refactor `src/app/api/cron/digest/route.ts`** to call `generateInsight` (keep the Monday gate + idempotency check + push). Replace the per-user body from the `// Aggregate the week` line through the `insights` insert with:
```typescript
    // Idempotency check (unchanged)
    const opId = `insight-weekly-${user.id}-${bounds.startsAt.slice(0, 10)}`
    const existingOp = await db.selectFrom('op_log').where('id', '=', opId).select('id').executeTakeFirst()
    if (existingOp) continue

    const { skipped } = await generateInsight({
      db, groq, userId: user.id, bounds, primaryCurrency, nowIso: now,
      opId, opType: 'create',
    })
    if (skipped) continue

    // Push (unchanged): insert push_notifications + sendPushToUser
    const notifId = `digest-${user.id}-${bounds.startsAt.slice(0, 10)}`
    await db.insertInto('push_notifications').values({
      id: notifId, user_id: user.id, title: 'Your week in review',
      body: '', url: '/app', created_at: now, read_at: null,
    }).onConflict(oc => oc.column('id').doNothing()).execute()
    try { await sendPushToUser(db, cfEnv, user.id) } catch (err) { console.error(`digest cron: sendPushToUser failed for ${user.id}:`, err) }
    digestsCreated++
```
Remove the now-unused imports (`aggregateWeek`, `writeDigestNarrative`, `fallbackSummary`, `applyOp`, `serverHlcFor`) and add `import { generateInsight } from '@/lib/insight-generate'`. **Note the push body:** the old code sliced `summary.slice(0,80)`; since the shared fn owns the summary, either have `generateInsight` return the summary for the push body, or set `body: 'Your week in review'`-style static text. Return `{ skipped, insight }` already carries `insight.summary` → use `body: (insightRow?.summary ?? '').slice(0,80)` by capturing the returned insight. Update the destructure to `const { skipped, insight } = await generateInsight(...)` and use `insight?.summary`.

- [ ] **Step 10: keep the cron regression test green — `tests/api/cron-digest-route.test.ts`.** The cron now imports `generateInsight` (which imports aggregate/narrative/materialize). Add `vi.mock('@/lib/materialize', () => ({ materializeRow: vi.fn() }))` if not present, and ensure the existing aggregate/narrative mocks still resolve (the shared fn uses them). Confirm the existing "processes users and returns count" test still passes (Monday-gated, idempotent). Adjust mocks minimally so behavior is unchanged.

- [ ] **Step 11: gate + commit.** typecheck → lint → test → build (all green; grows). Then:
```bash
git add src/lib/digest-window.ts src/lib/insight-generate.ts src/app/api/cron/digest/route.ts tests/digest-window.test.ts tests/lib/insight-generate.test.ts tests/api/cron-digest-route.test.ts
git commit -m "feat(insights): shared generateInsight core (cron refactor to LWW materialize) + currentWeekBounds"
```

---

## Task 2: On-demand generate endpoint

**Files:**
- Create: `src/app/api/insights/generate/route.ts`, `tests/api/insights-generate-route.test.ts`

**Interfaces — Consumes:** `generateInsight`, `currentWeekBounds` (Task 1). **Produces:** `POST /api/insights/generate` → `{ ok: true, insight } | { ok: false, reason: 'empty_week' }` (401 unauth).

- [ ] **Step 1: implement `src/app/api/insights/generate/route.ts`** (session-auth POST, current week, create-or-update):
```typescript
import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { currentWeekBounds } from '@/lib/digest-window'
import { generateInsight } from '@/lib/insight-generate'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { env } = getCloudflareContext()
  const cfEnv = env as { DB: D1Database; GROQ_API_KEY?: string }
  const db = createDb(cfEnv.DB)
  const groq = cfEnv.GROQ_API_KEY ? makeGroqClient(cfEnv.GROQ_API_KEY) : null

  const prefs = await db.selectFrom('user_prefs').where('user_id', '=', userId).selectAll().executeTakeFirst()
  const primaryCurrency = prefs?.primary_currency ?? 'INR'
  const tz = prefs?.tz ?? 'Asia/Kolkata'

  const nowIso = new Date().toISOString()
  const bounds = currentWeekBounds(nowIso, tz)
  const weekStart = bounds.startsAt.slice(0, 10)
  const entityId = `insight-${userId}-${weekStart}`

  // create vs refresh: does a row for this week already exist?
  const existing = await db.selectFrom('insights').where('id', '=', entityId).select('id').executeTakeFirst()
  const opType = existing ? 'update' : 'create'
  const opId = `insight-ondemand-${userId}-${weekStart}-${Date.now()}`

  const { skipped, insight } = await generateInsight({ db, groq, userId, bounds, primaryCurrency, nowIso, opId, opType })
  if (skipped) return NextResponse.json({ ok: false, reason: 'empty_week' })
  return NextResponse.json({ ok: true, insight })
}
```

- [ ] **Step 2: route tests — `tests/api/insights-generate-route.test.ts`** (mirror the agent/cron route mock style; mock `generateInsight`, `getSession`, `getCloudflareContext`, `createDb`):
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SESSION = { user: { id: 'u1', email: 't@x.com' } }
const generateInsight = vi.fn()
let existingRow: any = null
const fakeDb = {
  selectFrom: () => ({ where: function () { return this }, selectAll: function () { return this }, select: function () { return this }, executeTakeFirst: async () => existingRow }),
} as any

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, GROQ_API_KEY: 'k' } }) }))
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))
vi.mock('@/lib/agents/llm-client', () => ({ makeGroqClient: () => ({}) }))
vi.mock('@/lib/insight-generate', () => ({ generateInsight }))

const { POST } = await import('@/app/api/insights/generate/route')
const req = () => new Request('http://x/api/insights/generate', { method: 'POST' })

describe('/api/insights/generate', () => {
  beforeEach(async () => {
    vi.clearAllMocks(); existingRow = null
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValue(TEST_SESSION as any)
    generateInsight.mockResolvedValue({ skipped: false, insight: { id: 'insight-u1-2026-07-19', summary: 'S' } })
  })

  it('401 without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect((await POST(req())).status).toBe(401)
  })
  it('generates the current week (create when none exists)', async () => {
    const res = await POST(req())
    const body = await res.json() as { ok: boolean; insight: { id: string } }
    expect(body.ok).toBe(true)
    expect(generateInsight).toHaveBeenCalledWith(expect.objectContaining({ opType: 'create', userId: 'u1' }))
    expect(body.insight.id).toBe('insight-u1-2026-07-19')
  })
  it('refreshes (update op) when a row already exists', async () => {
    existingRow = { id: 'insight-u1-2026-07-19' }
    await POST(req())
    expect(generateInsight).toHaveBeenCalledWith(expect.objectContaining({ opType: 'update' }))
  })
  it('returns empty_week when the week has nothing', async () => {
    generateInsight.mockResolvedValueOnce({ skipped: true, insight: null })
    const body = await (await POST(req())).json() as { ok: boolean; reason: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('empty_week')
  })
})
```

- [ ] **Step 3: run tests → PASS** (`pnpm test tests/api/insights-generate-route.test.ts`).

- [ ] **Step 4: gate + commit.**
```bash
git add src/app/api/insights/generate/route.ts tests/api/insights-generate-route.test.ts
git commit -m "feat(insights): session-auth POST /api/insights/generate — current-week create/refresh"
```

---

## Task 3: `useInsights` hook + `InsightCard` extraction + `DigestCard` refactor

**Files:**
- Create: `src/hooks/use-insights.ts`, `src/components/insight-card.tsx`
- Modify: `src/components/digest-card.tsx`

**Interfaces — Produces:** `useInsights(userId): InsightRow[]` (newest-first, tombstones excluded); `<InsightCard insight={InsightRow} variant?: 'card' | 'detail' />`.
**No component/hook unit tests (repo convention); gate = typecheck + lint + build + existing tests unchanged.**

- [ ] **Step 1: `src/hooks/use-insights.ts`** (mirror `use-notes`):
```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type InsightRow } from '@/lib/dexie'

export function useInsights(userId: string | undefined): InsightRow[] {
  return useLiveQuery<InsightRow[], InsightRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.insights.where('user_id').equals(userId).toArray()
      return all.filter(i => !i.deleted_at).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    },
    [userId],
    [],
  ) ?? []
}
```

- [ ] **Step 2: `src/components/insight-card.tsx`** — extract DigestCard's rendering (week label + summary + metric chips). `variant='detail'` shows all `top_categories`:
```tsx
'use client'

import { Sparkles } from 'lucide-react'
import { currencySymbol } from '@/lib/currency'
import type { DigestMetrics } from '@/lib/digest-aggregate'
import type { InsightRow } from '@/lib/dexie'

export function InsightCard({ insight, variant = 'card' }: { insight: InsightRow; variant?: 'card' | 'detail' }) {
  let metrics: DigestMetrics | null = null
  try { metrics = JSON.parse(insight.metrics) as DigestMetrics } catch { metrics = null }
  const symbol = currencySymbol(metrics?.currency ?? 'INR')
  const div = (metrics?.currency ?? 'INR') === 'JPY' ? 1 : 100
  const weekLabel = `${insight.starts_at.slice(0, 10)} – ${insight.ends_at.slice(0, 10)}`
  const money = (n: number) => `${symbol}${(n / div).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="glass-accent rounded-lg p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-2" />
        <h3 className="text-sm font-semibold">Week in review</h3>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{weekLabel}</span>
      </div>
      <p className="mb-3 text-sm text-foreground">{insight.summary}</p>
      {metrics && (
        <div className="mb-2 flex flex-wrap gap-2">
          <Chip label="Spend" value={money(metrics.spend_total)} />
          <Chip label="Income" value={money(metrics.income_total)} />
          {metrics.tasks_completed > 0 && <Chip label="Done" value={String(metrics.tasks_completed)} />}
          {metrics.tasks_overdue > 0 && <Chip label="Overdue" value={String(metrics.tasks_overdue)} tone="danger" />}
        </div>
      )}
      {variant === 'detail' && metrics && metrics.top_categories.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {metrics.top_categories.map(c => (
            <li key={c.name} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.name}</span>
              <span className="font-mono tabular-nums">{money(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {metrics?.skipped_currencies && metrics.skipped_currencies.length > 0 && (
        <p className="text-[10px] text-muted-foreground">(Conversions skipped for {metrics.skipped_currencies.join(', ')} — no rates yet)</p>
      )}
    </div>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
      <span className={tone === 'danger' ? 'text-rose-600' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  )
}
```

- [ ] **Step 3: refactor `src/components/digest-card.tsx`** to render `<InsightCard insight={row} variant="card" />` for its body, KEEPING its existing gating (latest within 7 days, undismissed) + the dismiss button. The card keeps its own header/dismiss wrapper OR wraps `InsightCard`; simplest: keep DigestCard's outer structure + dismiss, replace the inner summary+chips markup with `<InsightCard insight={row} />`. Verify the rendered output is equivalent (same chips/summary). Add a "See past weeks →" `<Link href="/insights">` at the card's foot (this doubles as the nav entry point from Task 4).

- [ ] **Step 4: gate + commit.** typecheck → lint → test (unchanged) → build. Then:
```bash
git add src/hooks/use-insights.ts src/components/insight-card.tsx src/components/digest-card.tsx
git commit -m "feat(insights): useInsights hook + extracted InsightCard (DigestCard refactors onto it) + See-past-weeks link"
```

---

## Task 4: `/insights` list + `/insights/[id]` detail routes + Settings nav

**Files:**
- Create: `src/app/insights/page.tsx`, `src/app/insights/[id]/page.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces — Consumes:** `useInsights` + `InsightCard` (Task 3); `authClient.getSession` (auth guard); `pushPullOnce` (sync after generate).
**No route/component unit tests (repo convention); gate = typecheck + lint + build.**

- [ ] **Step 1: `src/app/insights/page.tsx`** — auth-guarded list + generate button (mirror `settings/preferences` auth pattern):
```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { InsightCard } from '@/components/insight-card'
import { useInsights } from '@/hooks/use-insights'
import { pushPullOnce } from '@/lib/sync-client'

export default function InsightsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const insights = useInsights(userId ?? undefined)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  async function generate() {
    if (!userId || generating) return
    setGenerating(true); setMsg(null)
    try {
      const res = await fetch('/api/insights/generate', { method: 'POST' })
      const data = await res.json() as { ok: boolean; reason?: string }
      if (data.ok) { await pushPullOnce({ userId }); setMsg('Updated this week\'s insight.') }
      else if (data.reason === 'empty_week') setMsg('Nothing logged this week yet.')
      else setMsg('Could not generate — try again.')
    } catch { setMsg('Could not generate — try again.') }
    finally { setGenerating(false) }
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Insights</h1>
          <button
            type="button"
            onClick={generate}
            disabled={generating || !userId}
            aria-busy={generating}
            className="glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate / refresh this week'}
          </button>
        </div>
        {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No insights yet — they arrive every Monday, or generate this week now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {insights.map(i => (
              <li key={i.id}>
                <Link href={`/insights/${i.id}`} className="block focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded-lg">
                  <InsightCard insight={i} variant="card" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/app" className="text-sm text-muted-foreground hover:underline">← Back to Pulse</Link>
      </main>
    </>
  )
}
```

- [ ] **Step 2: `src/app/insights/[id]/page.tsx`** — detail view (auth-guarded; find the insight by id from `useInsights`):
```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { InsightCard } from '@/components/insight-card'
import { useInsights } from '@/hooks/use-insights'

export default function InsightDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [userId, setUserId] = useState<string | null>(null)
  const insights = useInsights(userId ?? undefined)
  const insight = insights.find(i => i.id === params.id)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <Link href="/insights" className="text-sm text-muted-foreground hover:underline">← All insights</Link>
        {insight ? <InsightCard insight={insight} variant="detail" /> : <p className="text-sm text-muted-foreground">Insight not found.</p>}
      </main>
    </>
  )
}
```

- [ ] **Step 3: Settings nav entry — `src/app/settings/page.tsx`.** Add after the Preferences card:
```tsx
        <Link href="/insights">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Browse your weekly digests + generate this week on demand.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
```

- [ ] **Step 4: gate + commit.** typecheck → lint → test → build. Then:
```bash
git add src/app/insights/page.tsx "src/app/insights/[id]/page.tsx" src/app/settings/page.tsx
git commit -m "feat(insights): /insights list + /insights/[id] detail routes + Settings nav entry"
```

---

## Task 5: a11y pass + QA runbook

**Files:**
- Create: `docs/superpowers/notes/2026-07-21-pulse-insights-qa-runbook.md`
- Modify: (only if a11y gaps found) the insights pages / InsightCard

- [ ] **Step 1: a11y spot-check** — generate button labeled + `aria-busy` + ≥44px + focus-visible (done); list links focus-visible; detail back-link; metric chips readable (color not sole signal — figures present). Fix any gaps (attributes only).
- [ ] **Step 2: QA runbook — `docs/superpowers/notes/2026-07-21-pulse-insights-qa-runbook.md`:** deployed-PWA manual checks — open `/insights` (from DigestCard link + Settings); list shows past weeks newest-first; tap → detail with category breakdown; "Generate/refresh this week" with data → this week's insight appears/updates + persists after reload (synced); with an empty week → "nothing logged"; the DigestCard atop Money still shows the latest within 7 days + dismiss works; convergence: generate on one device → appears on another after sync.
- [ ] **Step 3: gate + commit.**
```bash
git add docs/superpowers/notes/2026-07-21-pulse-insights-qa-runbook.md
git commit -m "chore(insights): a11y pass + QA runbook"
```

---

## After all tasks

- Whole-branch multi-lens final review (base = `git merge-base main HEAD`): correctness/dead-code; **sync-integrity** (the crux — cron + on-demand both materialize via `materializeRow` LWW; refresh = an `update` op with newer HLC; server↔client convergence; the digest-cron refactor preserves Monday-gated/idempotent/push behavior); injection (endpoint session-auth self-only; agent never sees data); a11y/regression (DigestCard behavior byte-equivalent). The sync lens is the key one, as in Budgets.
- Then `superpowers:finishing-a-development-branch` (merge/deploy = Sheik's call). **No migration, no new cron** — clean deploy (5-cron cap untouched). Note: the digest-cron refactor changes server-side generation, so watch the first weekly cron run (or trigger `/api/insights/generate` on device) post-deploy to confirm the LWW path.
