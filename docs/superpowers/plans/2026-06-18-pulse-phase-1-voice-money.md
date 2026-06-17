# Pulse Phase 1 — Voice + Money Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the deployed-but-empty Pulse PWA into a voice-first personal money tracker — tap mic, say "spent 80 on chai," confirm a chip, see it on every signed-in device within seconds. Recurring rules (rent, salary, subscriptions) toggle from the same chip and fire daily via cron.

**Architecture:** All money/recurring/category writes flow through the existing Phase 0 op-log — zero new sync paths. Voice is a single HTTP round-trip (Whisper → Router → money_agent) returning JSON the client materializes locally + queues to sync. Recurring is cron-driven: a daily 02:00 UTC walk emits Ops for due rules. The Phase 0 substrate (auth, op_log, HLC, sync engine) is **unchanged** — Phase 1 is purely additive.

**Tech Stack:** Cloudflare Workers + D1 + Kysely + Better Auth + OpenNext (Phase 0, unchanged) + Groq SDK (whisper-large-v3-turbo / llama-3.1-8b-instant router / llama-3.1-70b-versatile parser) + Web MediaRecorder API + Dexie v2 + date-fns + Zod.

**Spec:** `docs/superpowers/specs/2026-06-16-pulse-phase-1-voice-money-design.md`

---

## File structure

### NEW files (created by this plan)

```
migrations/
  0002_phase_1_money.sql               # 3 tables + indexes

src/lib/op-schemas/
  index.ts                             # re-exports + getSchemaForKind dispatcher
  money.ts                             # Zod for money payload
  recurring.ts                         # Zod for recurring_rule payload
  category.ts                          # Zod for category payload

src/lib/
  seed-categories.ts                   # idempotent 14-category seeder (client-side)
  recurring.ts                         # computeNextDue + checkEndConditions
  voice-queue.ts                       # blob enqueue/drain over Dexie voice_queue

src/lib/agents/
  llm-client.ts                        # Groq SDK wrapper (retry/backoff/JSON-mode)
  whisper.ts                           # groqWhisper(blob, key)
  router.ts                            # routeIntent(text, categories, key)
  money-agent.ts                       # parseMoneyEntry(text, categories, key)
  prompts/
    router.ts                          # ROUTER_SYSTEM_PROMPT + few-shot
    money-agent.ts                     # MONEY_AGENT_SYSTEM_PROMPT + few-shot
  schemas/
    router-response.ts                 # Zod for Router JSON output
    money-agent-response.ts            # Zod for money_agent JSON output

src/app/api/
  agent/route.ts                       # POST: typed text → parsed payload
  voice/route.ts                       # POST: multipart audio → parsed payload
  cron/recur/route.ts                  # POST: cron-triggered recurring materializer

src/app/settings/
  page.tsx                             # settings index (links to sub-pages)
  categories/page.tsx                  # category CRUD UI
  recurring/page.tsx                   # recurring-rules CRUD UI

src/components/
  confirmation-chip.tsx                # always-expanded card with editable fields + recurring toggle
  voice-recorder.tsx                   # mic button + MediaRecorder + voice-queue drain
  money-card.tsx                       # summary card: headline + delta + top 3 categories
  money-list.tsx                       # entry list with inline edit/delete + long-press menu
  category-picker.tsx                  # inline pill picker with search
  period-picker.tsx                    # daily/weekly/monthly/yearly + interval N
  undo-toast.tsx                       # bottom toast for undo-after-delete
  ui/switch.tsx                        # shadcn switch primitive (added in 1.4)

src/hooks/
  use-categories.ts                    # live Dexie query for user's categories
  use-money-entries.ts                 # live Dexie query for entries with period filter
  use-recurring-rules.ts               # live Dexie query for rules
  use-undo-stack.ts                    # in-memory undo stack for soft deletes

scripts/
  eval-agents.ts                       # dev tool: run adversarial fixtures vs real Groq

tests/
  op-schemas.test.ts                   # per-kind Zod validation
  seed-categories.test.ts              # idempotency + correct kinds
  recurring.test.ts                    # computeNextDue (20+ cases) + property tests
  voice-queue.test.ts                  # enqueue/drain/retry behavior
  agents/
    whisper.test.ts                    # mocked client
    router.test.ts                     # mocked client
    money-agent.test.ts                # runs against fixtures + mocked client
  fixtures/
    money-agent-cases.ts               # 50+ adversarial cases
  api/
    agent-route.test.ts                # /api/agent end-to-end (mocked agents)
    voice-route.test.ts                # /api/voice end-to-end (mocked agents)
    cron-recur-route.test.ts           # cron materialization
  integration/
    phase-1-flows.test.ts              # phone↔desktop voice + recurring fire + edit

docs/superpowers/notes/
  phase-1-retro.md                     # written at end of Phase 1.6
```

### MODIFIED files

```
src/lib/db.ts                          # add MoneyEntryTable / RecurringRuleTable / CategoryTable
src/lib/dexie.ts                       # bump to .version(2), add 3 stores
src/lib/sync-client.ts                 # extend applyLocalOp branches for money/recurring/category
src/app/api/sync/route.ts              # extend materialization for new entity_kinds
src/app/app/page.tsx                   # replace WidgetForm with voice + chip + money list
wrangler.toml                          # add [triggers].crons = ["0 2 * * *"]
.github/workflows/deploy.yml           # add `d1 execute --file=migrations/0002_phase_1_money.sql`
package.json                           # add groq-sdk + date-fns deps
```

### DELETED files

```
src/components/widget-form.tsx         # Phase 0 reference impl no longer needed
tests/dexie.test.ts                    # rewritten as part of v2 bump (Task 3)
```

---

## Sub-phase roadmap

| Sub-phase | Tasks | "Done" looks like |
|---|---|---|
| 1.0 Schema + types | 1–6 | Phase 0 50 tests still pass + ~30 new unit tests for new Op kinds |
| 1.1 Categories + seed | 7–9 | Phone-created category appears on desktop within 10s |
| 1.2 Manual money entry | 10–13 | Typed entry "₹80 chai food" round-trips phone↔desktop |
| 1.3 Voice + agents | 14–20 | Voice "spent 80 on chai" logged + visible on both devices in <5s |
| 1.4 Recurring engine | 21–24 | Rule fires next morning; entry appears on both devices |
| 1.5 Dashboard + polish | 25–26 | Card reads correctly across week/month transitions |
| 1.6 E2E + cleanup | 27–28 | All success criteria from spec verified |

---

## Pre-flight (one-time setup, before Task 1)

Add new dependencies:

```powershell
pnpm add groq-sdk date-fns
```

Verify the lockfile updated and CI still green:

```powershell
pnpm install --frozen-lockfile
pnpm test
```

Expected: same 50 tests pass.

Commit:

```powershell
git add package.json pnpm-lock.yaml
git commit -m "chore: add groq-sdk + date-fns for Phase 1"
```

---

# Phase 1.0 — Schema + Types

## Task 1: Migration 0002 — money / recurring / categories schema

**Files:**
- Create: `migrations/0002_phase_1_money.sql`
- Modify: `.github/workflows/deploy.yml` (add d1 execute step for 0002)

> **Note:** the `[triggers].crons` config in `wrangler.toml` is added in Task 23 (where the route it fires lands), not here — co-locating trigger + route so the cron never points at a missing route in a deployed build.

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0002_phase_1_money.sql`:

```sql
-- Phase 1: voice + money domain
-- All tables use snake_case + per-field HLC JSON to match the Phase 0 sync engine.
-- Additive only: Phase 0 tables (user, session, account, verification, devices,
-- op_log, widgets) are unchanged.

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT    PRIMARY KEY NOT NULL,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('spend', 'income')),
  icon          TEXT,
  color         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_archived   INTEGER NOT NULL DEFAULT 0,
  field_hlcs    TEXT    NOT NULL,
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  UNIQUE (user_id, name, kind)
);

CREATE INDEX IF NOT EXISTS idx_categories_user_kind ON categories(user_id, kind);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id                  TEXT    PRIMARY KEY NOT NULL,
  user_id             TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount              INTEGER NOT NULL,
  currency            TEXT    NOT NULL DEFAULT 'INR',
  direction           TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id         TEXT    REFERENCES categories(id),
  description         TEXT,
  period              TEXT    NOT NULL CHECK (period IN ('daily','weekly','monthly','yearly')),
  interval_count      INTEGER NOT NULL DEFAULT 1,
  anchor_at           TEXT    NOT NULL,
  next_due_at         TEXT    NOT NULL,
  end_condition_kind  TEXT    NOT NULL DEFAULT 'never' CHECK (end_condition_kind IN ('never','until','count')),
  end_until           TEXT,
  end_count           INTEGER,
  occurrences_so_far  INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  field_hlcs          TEXT    NOT NULL,
  deleted_at          TEXT,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_due
  ON recurring_rules(next_due_at)
  WHERE is_active = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS money_entries (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount             INTEGER NOT NULL,
  currency           TEXT    NOT NULL DEFAULT 'INR',
  direction          TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id        TEXT    REFERENCES categories(id),
  description        TEXT,
  occurred_at        TEXT    NOT NULL,
  source             TEXT    NOT NULL CHECK (source IN ('voice', 'manual', 'recurring')),
  raw_input          TEXT,
  recurring_rule_id  TEXT    REFERENCES recurring_rules(id),
  field_hlcs         TEXT    NOT NULL,
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_money_user_occurred  ON money_entries(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_user_recurring ON money_entries(user_id, recurring_rule_id);
```

- [ ] **Step 2: Apply locally and verify table list**

```powershell
pnpm exec wrangler d1 execute pulse --local --file=migrations/0002_phase_1_money.sql
pnpm exec wrangler d1 execute pulse --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected output includes (in alphabetical order): `account`, `categories`, `devices`, `money_entries`, `op_log`, `recurring_rules`, `session`, `user`, `verification`, `widgets`.

- [ ] **Step 3: Verify the partial index works**

```powershell
pnpm exec wrangler d1 execute pulse --local --command="SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='recurring_rules'"
```

Expected: `idx_recurring_due` listed (SQLite creates an autoindex too — that's fine).

- [ ] **Step 4: Add d1 execute step for 0002 to deploy.yml**

Edit `.github/workflows/deploy.yml` — duplicate the existing "Apply D1 migrations" step (same `continue-on-error: true`) for the new file. After the existing step (line 56–69), append:

```yaml
      - name: Apply D1 migrations — Phase 1 (idempotent)
        continue-on-error: true
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: d1 execute pulse --remote --file=migrations/0002_phase_1_money.sql
```

- [ ] **Step 5: Commit**

```powershell
git add migrations/0002_phase_1_money.sql .github/workflows/deploy.yml
git commit -m "feat(schema): add Phase 1 money/recurring/category tables"
```

---

## Task 2: Extend DB types in src/lib/db.ts

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `tests/db-types.test.ts`

- [ ] **Step 1: Read the existing tests/db-types.test.ts to learn the assertion style**

Open `tests/db-types.test.ts` — note it uses `expectTypeOf` from vitest. Patterns will match.

- [ ] **Step 2: Add failing type test for the three new tables**

Append to `tests/db-types.test.ts`:

```typescript
import { expectTypeOf } from 'vitest'
import type { DB, MoneyEntryTable, RecurringRuleTable, CategoryTable } from '@/lib/db'

describe('Phase 1 DB types', () => {
  it('DB includes money_entries / recurring_rules / categories', () => {
    expectTypeOf<DB>().toHaveProperty('money_entries')
    expectTypeOf<DB>().toHaveProperty('recurring_rules')
    expectTypeOf<DB>().toHaveProperty('categories')
  })

  it('MoneyEntryTable has required fields', () => {
    expectTypeOf<MoneyEntryTable>().toHaveProperty('amount').toEqualTypeOf<number>()
    expectTypeOf<MoneyEntryTable>().toHaveProperty('direction').toEqualTypeOf<'out' | 'in'>()
    expectTypeOf<MoneyEntryTable>().toHaveProperty('source').toEqualTypeOf<'voice' | 'manual' | 'recurring'>()
    expectTypeOf<MoneyEntryTable>().toHaveProperty('field_hlcs').toEqualTypeOf<string>()
  })

  it('RecurringRuleTable has period + interval + end conditions', () => {
    expectTypeOf<RecurringRuleTable>().toHaveProperty('period').toEqualTypeOf<'daily' | 'weekly' | 'monthly' | 'yearly'>()
    expectTypeOf<RecurringRuleTable>().toHaveProperty('end_condition_kind').toEqualTypeOf<'never' | 'until' | 'count'>()
    expectTypeOf<RecurringRuleTable>().toHaveProperty('next_due_at').toEqualTypeOf<string>()
  })

  it('CategoryTable has spend/income kind', () => {
    expectTypeOf<CategoryTable>().toHaveProperty('kind').toEqualTypeOf<'spend' | 'income'>()
  })
})
```

- [ ] **Step 3: Run — verify failure**

```powershell
pnpm test -- tests/db-types.test.ts
```

Expected: TypeScript error — `MoneyEntryTable`, `RecurringRuleTable`, `CategoryTable` not exported.

- [ ] **Step 4: Add the new interfaces to src/lib/db.ts**

Edit `src/lib/db.ts` — append new interfaces after `WidgetTable`:

```typescript
export interface CategoryTable {
  id: string
  user_id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  color: string | null
  sort_order: number
  is_archived: number
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface RecurringRuleTable {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  anchor_at: string
  next_due_at: string
  end_condition_kind: 'never' | 'until' | 'count'
  end_until: string | null
  end_count: number | null
  occurrences_so_far: number
  is_active: number
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface MoneyEntryTable {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  occurred_at: string
  source: 'voice' | 'manual' | 'recurring'
  raw_input: string | null
  recurring_rule_id: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}
```

Then update the `DB` interface to include them:

```typescript
export interface DB {
  user: UserTable
  session: SessionTable
  account: AccountTable
  verification: VerificationTable
  devices: DeviceTable
  op_log: OpLogTable
  widgets: WidgetTable
  categories: CategoryTable
  recurring_rules: RecurringRuleTable
  money_entries: MoneyEntryTable
}
```

- [ ] **Step 5: Run — verify tests pass**

```powershell
pnpm test -- tests/db-types.test.ts
pnpm typecheck
```

Expected: all type tests pass; full typecheck still green.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/db.ts tests/db-types.test.ts
git commit -m "feat(db): add Kysely types for money_entries/recurring_rules/categories"
```

---

## Task 3: Dexie v2 bump + client-side row types

**Files:**
- Modify: `src/lib/dexie.ts`
- Create: `tests/dexie.test.ts` (rewrite — Phase 0 version is being replaced)

- [ ] **Step 1: Write failing tests for v2 stores**

Replace `tests/dexie.test.ts` with:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'

describe('Dexie schema v2', () => {
  beforeEach(async () => { await resetDb() })

  it('exposes the Phase 1 stores', () => {
    expect(db.money_entries).toBeDefined()
    expect(db.recurring_rules).toBeDefined()
    expect(db.categories).toBeDefined()
  })

  it('round-trips a money_entries row', async () => {
    const row = {
      id: 'm1', user_id: 'u1',
      amount: 8000, currency: 'INR', direction: 'out' as const,
      category_id: 'c1', description: 'chai',
      occurred_at: '2026-06-18T14:30:00Z',
      source: 'voice' as const, raw_input: 'spent 80 on chai',
      recurring_rule_id: null,
      field_hlcs: { amount: '0000000000000001-000000-d1' },
      deleted_at: null,
      created_at: '2026-06-18T14:30:00Z',
      updated_at: '2026-06-18T14:30:00Z',
    }
    await db.money_entries.put(row)
    const back = await db.money_entries.get('m1')
    expect(back?.amount).toBe(8000)
    expect(back?.description).toBe('chai')
  })

  it('compound index [user_id+occurred_at] supports range queries', async () => {
    await db.money_entries.bulkPut([
      { id: 'a', user_id: 'u1', amount: 1, currency: 'INR', direction: 'out',
        category_id: null, description: null,
        occurred_at: '2026-06-01T00:00:00Z',
        source: 'manual', raw_input: null, recurring_rule_id: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
      { id: 'b', user_id: 'u1', amount: 2, currency: 'INR', direction: 'out',
        category_id: null, description: null,
        occurred_at: '2026-06-15T00:00:00Z',
        source: 'manual', raw_input: null, recurring_rule_id: null,
        field_hlcs: {}, deleted_at: null,
        created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' },
    ])
    const rows = await db.money_entries
      .where('[user_id+occurred_at]')
      .between(['u1', '2026-06-10T00:00:00Z'], ['u1', '2026-06-30T00:00:00Z'])
      .toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('b')
  })

  it('voice_queue from Phase 0 still works', async () => {
    await db.voice_queue.put({
      id: 'v1', blob: new Blob(['x']),
      created_at: '2026-06-18T14:30:00Z',
      retry_count: 0, status: 'queued',
    })
    expect(await db.voice_queue.count()).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify failure**

```powershell
pnpm test -- tests/dexie.test.ts
```

Expected: `db.money_entries is undefined` (v2 not yet defined).

- [ ] **Step 3: Bump Dexie to v2**

Replace `src/lib/dexie.ts` with:

```typescript
import Dexie, { type EntityTable } from 'dexie'
import type { Op } from '@/types/ops'

type SyncMeta = {
  key: string
  value: string
}

type VoiceQueueItem = {
  id: string
  blob: Blob
  created_at: string
  retry_count: number
  status: 'queued' | 'transcribing' | 'done' | 'failed'
}

export type WidgetRow = {
  id: string
  user_id: string
  label: string | null
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type CategoryRow = {
  id: string
  user_id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  color: string | null
  sort_order: number
  is_archived: number
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type RecurringRuleRow = {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  anchor_at: string
  next_due_at: string
  end_condition_kind: 'never' | 'until' | 'count'
  end_until: string | null
  end_count: number | null
  occurrences_so_far: number
  is_active: number
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type MoneyEntryRow = {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  occurred_at: string
  source: 'voice' | 'manual' | 'recurring'
  raw_input: string | null
  recurring_rule_id: string | null
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

class PulseDb extends Dexie {
  op_log!: EntityTable<Op, 'id'>
  widgets!: EntityTable<WidgetRow, 'id'>
  sync_meta!: EntityTable<SyncMeta, 'key'>
  voice_queue!: EntityTable<VoiceQueueItem, 'id'>
  categories!: EntityTable<CategoryRow, 'id'>
  recurring_rules!: EntityTable<RecurringRuleRow, 'id'>
  money_entries!: EntityTable<MoneyEntryRow, 'id'>

  constructor() {
    super('pulse')
    this.version(1).stores({
      op_log: 'id, hlc, entity_kind, entity_id',
      widgets: 'id, user_id, updated_at',
      sync_meta: 'key',
      voice_queue: 'id, status, created_at',
    })
    this.version(2).stores({
      // op_log / widgets / sync_meta / voice_queue keep their v1 schemas (no change)
      // New v2 stores:
      categories:      'id, user_id, [user_id+kind], sort_order',
      recurring_rules: 'id, user_id, next_due_at, is_active',
      money_entries:   'id, user_id, occurred_at, [user_id+occurred_at], category_id, recurring_rule_id',
    })
  }
}

export const db = new PulseDb()

export async function resetDb() {
  await db.op_log.clear()
  await db.widgets.clear()
  await db.sync_meta.clear()
  await db.voice_queue.clear()
  await db.categories.clear()
  await db.recurring_rules.clear()
  await db.money_entries.clear()
}
```

- [ ] **Step 4: Run — verify tests pass**

```powershell
pnpm test -- tests/dexie.test.ts
```

Expected: 4 dexie tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/dexie.ts tests/dexie.test.ts
git commit -m "feat(dexie): bump to v2 with categories/recurring_rules/money_entries"
```

---

## Task 4: Op payload Zod schemas (money + recurring + category)

**Files:**
- Create: `src/lib/op-schemas/money.ts`
- Create: `src/lib/op-schemas/recurring.ts`
- Create: `src/lib/op-schemas/category.ts`
- Create: `src/lib/op-schemas/index.ts`
- Create: `tests/op-schemas.test.ts`

- [ ] **Step 1: Write failing tests for all three schemas**

Create `tests/op-schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'
import { RecurringPayloadSchema } from '@/lib/op-schemas/recurring'
import { CategoryPayloadSchema } from '@/lib/op-schemas/category'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'

describe('MoneyPayloadSchema', () => {
  it('accepts a minimal valid create payload', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 8000, currency: 'INR', direction: 'out',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(true)
  })

  it('rejects negative amount', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: -1, currency: 'INR', direction: 'out',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-ISO-4217 currency', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 100, currency: 'XX', direction: 'out',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects bad direction', () => {
    const r = MoneyPayloadSchema.safeParse({
      amount: 100, currency: 'INR', direction: 'sideways',
      occurred_at: '2026-06-18T14:30:00Z', source: 'voice',
    })
    expect(r.success).toBe(false)
  })

  it('accepts partial update payload', () => {
    const r = MoneyPayloadSchema.partial().safeParse({ description: 'updated note' })
    expect(r.success).toBe(true)
  })
})

describe('RecurringPayloadSchema', () => {
  it('accepts a monthly rule', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 2500000, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 1,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'never',
      is_active: 1,
    })
    expect(r.success).toBe(true)
  })

  it('rejects interval_count of 0', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 1, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 0,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'never',
      is_active: 1,
    })
    expect(r.success).toBe(false)
  })

  it('requires end_until when end_condition_kind=until', () => {
    const r = RecurringPayloadSchema.safeParse({
      amount: 1, currency: 'INR', direction: 'out',
      period: 'monthly', interval_count: 1,
      anchor_at: '2026-06-01T00:00:00Z',
      next_due_at: '2026-07-01T00:00:00Z',
      end_condition_kind: 'until',
      is_active: 1,
    })
    expect(r.success).toBe(false)
  })
})

describe('CategoryPayloadSchema', () => {
  it('accepts a minimal spend category', () => {
    const r = CategoryPayloadSchema.safeParse({
      name: 'Food', kind: 'spend', sort_order: 0,
    })
    expect(r.success).toBe(true)
  })

  it('rejects empty name', () => {
    const r = CategoryPayloadSchema.safeParse({
      name: '', kind: 'spend', sort_order: 0,
    })
    expect(r.success).toBe(false)
  })
})

describe('getPayloadSchemaForKind dispatcher', () => {
  it('returns the right schema per entity_kind', () => {
    expect(getPayloadSchemaForKind('money')).toBe(MoneyPayloadSchema)
    expect(getPayloadSchemaForKind('recurring')).toBe(RecurringPayloadSchema)
    expect(getPayloadSchemaForKind('category')).toBe(CategoryPayloadSchema)
  })

  it('returns null for kinds without a schema (e.g. widget)', () => {
    expect(getPayloadSchemaForKind('widget')).toBeNull()
  })
})
```

- [ ] **Step 2: Run — verify failure**

```powershell
pnpm test -- tests/op-schemas.test.ts
```

Expected: module-not-found errors for the three new files.

- [ ] **Step 3: Implement money schema**

Create `src/lib/op-schemas/money.ts`:

```typescript
import { z } from 'zod'

// ISO 4217 — restricted list for v1; can expand later
export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD', 'CAD'] as const
export type Currency = typeof SUPPORTED_CURRENCIES[number]

export const MoneyPayloadSchema = z.object({
  amount: z.number().int().nonnegative(),                    // smallest unit (paise/cents)
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_id: z.string().min(1).nullable().optional(),
  description: z.string().max(120).nullable().optional(),
  occurred_at: z.string().datetime(),                        // ISO 8601
  source: z.enum(['voice', 'manual', 'recurring']),
  raw_input: z.string().nullable().optional(),
  recurring_rule_id: z.string().min(1).nullable().optional(),
})

export type MoneyPayload = z.infer<typeof MoneyPayloadSchema>
```

- [ ] **Step 4: Implement recurring schema**

Create `src/lib/op-schemas/recurring.ts`:

```typescript
import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from './money'

export const RecurringPayloadSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_id: z.string().min(1).nullable().optional(),
  description: z.string().max(120).nullable().optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval_count: z.number().int().positive(),               // every N periods
  anchor_at: z.string().datetime(),
  next_due_at: z.string().datetime(),
  end_condition_kind: z.enum(['never', 'until', 'count']),
  end_until: z.string().datetime().nullable().optional(),
  end_count: z.number().int().positive().nullable().optional(),
  occurrences_so_far: z.number().int().nonnegative().optional(),
  is_active: z.union([z.literal(0), z.literal(1)]),
}).refine(
  (v) => v.end_condition_kind !== 'until' || !!v.end_until,
  { message: 'end_until is required when end_condition_kind = "until"' },
).refine(
  (v) => v.end_condition_kind !== 'count' || !!v.end_count,
  { message: 'end_count is required when end_condition_kind = "count"' },
)

export type RecurringPayload = z.infer<typeof RecurringPayloadSchema>
```

- [ ] **Step 5: Implement category schema**

Create `src/lib/op-schemas/category.ts`:

```typescript
import { z } from 'zod'

export const CategoryPayloadSchema = z.object({
  name: z.string().min(1).max(40),
  kind: z.enum(['spend', 'income']),
  icon: z.string().max(8).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  sort_order: z.number().int().nonnegative(),
  is_archived: z.union([z.literal(0), z.literal(1)]).optional(),
})

export type CategoryPayload = z.infer<typeof CategoryPayloadSchema>
```

- [ ] **Step 6: Implement dispatcher index**

Create `src/lib/op-schemas/index.ts`:

```typescript
import type { z } from 'zod'
import { MoneyPayloadSchema } from './money'
import { RecurringPayloadSchema } from './recurring'
import { CategoryPayloadSchema } from './category'
import type { ENTITY_KINDS } from '@/types/ops'

export { MoneyPayloadSchema, RecurringPayloadSchema, CategoryPayloadSchema }
export type { MoneyPayload } from './money'
export type { RecurringPayload } from './recurring'
export type { CategoryPayload } from './category'

type Kind = typeof ENTITY_KINDS[number]

export function getPayloadSchemaForKind(kind: Kind): z.ZodTypeAny | null {
  switch (kind) {
    case 'money':    return MoneyPayloadSchema
    case 'recurring':return RecurringPayloadSchema
    case 'category': return CategoryPayloadSchema
    default:         return null   // widget / task / project / learning / note / budget / insight
  }
}
```

- [ ] **Step 7: Run — verify tests pass**

```powershell
pnpm test -- tests/op-schemas.test.ts
pnpm typecheck
```

Expected: 13 tests pass; typecheck green.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/op-schemas tests/op-schemas.test.ts
git commit -m "feat(ops): Zod payload schemas for money/recurring/category"
```

---

## Task 5: Extend applyLocalOp branches for new entity kinds

**Files:**
- Modify: `src/lib/sync-client.ts`
- Modify: `tests/sync-client.test.ts` (extend; do not replace existing assertions)

- [ ] **Step 1: Write failing tests for the new branches**

Append to `tests/sync-client.test.ts`:

```typescript
import { db, resetDb } from '@/lib/dexie'
import { applyLocalOp } from '@/lib/sync-client'

describe('applyLocalOp — Phase 1 entity kinds', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a money_entries row from a money create op', async () => {
    await applyLocalOp({
      id: 'op-m1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm1',
      op_type: 'create',
      payload: {
        amount: 8000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual', description: 'chai',
      },
      schema_version: 1,
    })
    const row = await db.money_entries.get('m1')
    expect(row?.amount).toBe(8000)
    expect(row?.description).toBe('chai')
  })

  it('materializes a category create op', async () => {
    await applyLocalOp({
      id: 'op-c1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'category', entity_id: 'c1',
      op_type: 'create',
      payload: { name: 'Food', kind: 'spend', sort_order: 0, icon: '🍴' },
      schema_version: 1,
    })
    const row = await db.categories.get('c1')
    expect(row?.name).toBe('Food')
    expect(row?.kind).toBe('spend')
  })

  it('materializes a recurring create op', async () => {
    await applyLocalOp({
      id: 'op-r1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'recurring', entity_id: 'r1',
      op_type: 'create',
      payload: {
        amount: 2500000, currency: 'INR', direction: 'out',
        period: 'monthly', interval_count: 1,
        anchor_at: '2026-06-01T00:00:00Z',
        next_due_at: '2026-07-01T00:00:00Z',
        end_condition_kind: 'never',
        is_active: 1,
      },
      schema_version: 1,
    })
    const row = await db.recurring_rules.get('r1')
    expect(row?.period).toBe('monthly')
    expect(row?.next_due_at).toBe('2026-07-01T00:00:00Z')
  })

  it('is idempotent per op.id across all entity kinds', async () => {
    const op = {
      id: 'op-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money' as const, entity_id: 'mDup',
      op_type: 'create' as const,
      payload: {
        amount: 100, currency: 'INR', direction: 'out' as const,
        occurred_at: '2026-06-18T14:30:00Z', source: 'manual' as const,
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.money_entries.count()).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify failure**

```powershell
pnpm test -- tests/sync-client.test.ts
```

Expected: existing widget test still passes; the 4 new tests fail (the money/recurring/category rows aren't materialized — only op_log gets the op).

- [ ] **Step 3: Extend applyLocalOp**

Edit `src/lib/sync-client.ts` — replace the `applyLocalOp` function:

```typescript
export async function applyLocalOp(op: Op): Promise<void> {
  const existing = await db.op_log.get(op.id)
  if (existing) return

  await db.transaction(
    'rw',
    [db.op_log, db.widgets, db.money_entries, db.recurring_rules, db.categories],
    async () => {
      await db.op_log.add(op)

      switch (op.entity_kind) {
        case 'widget': {
          const current = await db.widgets.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.widgets.put(next as never)
          return
        }
        case 'money': {
          const current = await db.money_entries.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.money_entries.put(next as never)
          return
        }
        case 'recurring': {
          const current = await db.recurring_rules.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.recurring_rules.put(next as never)
          return
        }
        case 'category': {
          const current = await db.categories.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.categories.put(next as never)
          return
        }
        // 'task' / 'project' / 'learning' / 'note' / 'budget' / 'insight':
        // op_log stores the op but no client table yet (later phases).
      }
    },
  )
}
```

- [ ] **Step 4: Run — verify all sync-client tests pass**

```powershell
pnpm test -- tests/sync-client.test.ts
```

Expected: all assertions pass (widget + 4 new Phase 1).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/sync-client.ts tests/sync-client.test.ts
git commit -m "feat(sync): client materializes money/recurring/category ops"
```

---

## Task 6: Extend /api/sync server-side materialization

**Files:**
- Modify: `src/app/api/sync/route.ts`
- Modify: `tests/sync-integration.test.ts` (extend)

- [ ] **Step 1: Read existing tests/sync-integration.test.ts to learn the pattern**

Open `tests/sync-integration.test.ts` — note it constructs a D1 mock or uses a fixture DB. Match that pattern. (If the test uses `miniflare` or similar — read carefully; do NOT rewrite the harness.)

- [ ] **Step 2: Append failing test for new entity kinds**

Add to `tests/sync-integration.test.ts`:

```typescript
describe('/api/sync — Phase 1 entity kinds', () => {
  it('persists a money entry and includes it in the next pull', async () => {
    // Use the same in-memory D1 harness as the existing tests in this file.
    // Assume helpers like `applyMigrations(db)`, `withTestUser(callback)`, `callSync(payload)`
    // exist from Phase 0. If named differently, match the existing pattern.

    await withTestUser(async ({ userId, callSync }) => {
      const op = {
        id: 'op-m1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1', user_id: userId,
        entity_kind: 'money', entity_id: 'm1',
        op_type: 'create',
        payload: {
          amount: 8000, currency: 'INR', direction: 'out',
          occurred_at: '2026-06-18T14:30:00Z',
          source: 'manual', description: 'chai',
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-m1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('money')

      // Server-side row materialized
      const rows = await testDb.selectFrom('money_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].amount).toBe(8000)
    })
  })

  // (Repeat the same shape for category + recurring — 2 more tests, structurally identical
  // with the entity_kind / table / payload swapped.)
})
```

- [ ] **Step 3: Run — verify failure**

```powershell
pnpm test -- tests/sync-integration.test.ts
```

Expected: rows are missing from `money_entries` because the server only materializes `widget`.

- [ ] **Step 4: Extend the sync route**

Edit `src/app/api/sync/route.ts` — extract the materialization block into a helper that handles all entity kinds. Replace the section after the `await db.insertInto('op_log')...execute()` call with:

```typescript
    await materializeRow(db, op, userId)
```

Then add the helper function at the bottom of the same file:

```typescript
async function materializeRow(db: Kysely<DB>, op: Op, userId: string) {
  switch (op.entity_kind) {
    case 'widget':            return materializeWidget(db, op, userId)
    case 'money':             return materializeRow_LWW(db, op, userId, 'money_entries', MONEY_FIELDS)
    case 'recurring':         return materializeRow_LWW(db, op, userId, 'recurring_rules', RECURRING_FIELDS)
    case 'category':          return materializeRow_LWW(db, op, userId, 'categories', CATEGORY_FIELDS)
    default:                  return    // op_log stores the op; no materialization yet
  }
}

const MONEY_FIELDS = [
  'amount', 'currency', 'direction', 'category_id', 'description',
  'occurred_at', 'source', 'raw_input', 'recurring_rule_id',
] as const

const RECURRING_FIELDS = [
  'amount', 'currency', 'direction', 'category_id', 'description',
  'period', 'interval_count', 'anchor_at', 'next_due_at',
  'end_condition_kind', 'end_until', 'end_count',
  'occurrences_so_far', 'is_active',
] as const

const CATEGORY_FIELDS = [
  'name', 'kind', 'icon', 'color', 'sort_order', 'is_archived',
] as const

async function materializeRow_LWW(
  db: Kysely<DB>,
  op: Op,
  userId: string,
  tableName: 'money_entries' | 'recurring_rules' | 'categories',
  fields: readonly string[],
) {
  const existing = await db
    .selectFrom(tableName)
    .where('id', '=', op.entity_id)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst()

  const existingRow = existing
    ? {
        ...existing,
        field_hlcs: JSON.parse(existing.field_hlcs as string) as Record<string, string>,
      } as never
    : undefined

  const merged = applyOp(existingRow, op) as Record<string, unknown>

  const row: Record<string, unknown> = {
    id: op.entity_id,
    user_id: userId,
    field_hlcs: JSON.stringify(merged.field_hlcs),
    deleted_at: merged.deleted_at,
    created_at: merged.created_at,
    updated_at: merged.updated_at,
  }
  for (const f of fields) row[f] = merged[f] ?? null

  const updates: Record<string, unknown> = {
    field_hlcs: row.field_hlcs,
    deleted_at: row.deleted_at,
    updated_at: row.updated_at,
  }
  for (const f of fields) updates[f] = row[f]

  await db
    .insertInto(tableName as never)
    .values(row as never)
    .onConflict(oc => oc.column('id').doUpdateSet(updates as never))
    .execute()
}

// Keep the existing widget materializer (was inlined; extract to its own fn)
async function materializeWidget(db: Kysely<DB>, op: Op, userId: string) {
  // (move the existing widget block here verbatim)
}
```

Move the existing widget materialization logic (lines 86–129 of the current route.ts) into `materializeWidget`. Import `Kysely` and `DB` if not already.

- [ ] **Step 5: Run — verify all sync tests pass**

```powershell
pnpm test -- tests/sync-integration.test.ts
pnpm test
```

Expected: full test suite still passes (Phase 0 + new Phase 1 sync tests).

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/sync/route.ts tests/sync-integration.test.ts
git commit -m "feat(sync): server materializes money/recurring/category via shared LWW helper"
```

**Sub-phase 1.0 done.** Run the full suite to confirm everything green before moving on:

```powershell
pnpm test
pnpm typecheck
pnpm lint
```

Expected: ~80 tests pass (50 Phase 0 + ~30 new), typecheck + lint clean.

---

# Phase 1.1 — Categories + seed

## Task 7: seed-categories helper (idempotent, client-side)

**Files:**
- Create: `src/lib/seed-categories.ts`
- Create: `tests/seed-categories.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/seed-categories.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { seedDefaultCategoriesIfEmpty, DEFAULT_CATEGORIES } from '@/lib/seed-categories'

describe('seedDefaultCategoriesIfEmpty', () => {
  beforeEach(async () => { await resetDb() })

  it('inserts 14 categories when the user has none', async () => {
    const inserted = await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    expect(inserted).toBe(14)
    const all = await db.categories.where('user_id').equals('u1').toArray()
    expect(all).toHaveLength(14)
  })

  it('inserts 9 spend + 5 income categories', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const spend  = await db.categories.where({ user_id: 'u1', kind: 'spend' }).toArray()
    const income = await db.categories.where({ user_id: 'u1', kind: 'income' }).toArray()
    expect(spend).toHaveLength(9)
    expect(income).toHaveLength(5)
  })

  it('emits an Op per category into op_log', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const ops = await db.op_log.where('entity_kind').equals('category').toArray()
    expect(ops).toHaveLength(14)
    expect(ops.every(o => o.op_type === 'create')).toBe(true)
  })

  it('is idempotent — second call inserts nothing', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const second = await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    expect(second).toBe(0)
    expect(await db.categories.where('user_id').equals('u1').count()).toBe(14)
  })

  it('scopes per user — u2 still gets seed even if u1 has categories', async () => {
    await seedDefaultCategoriesIfEmpty({ userId: 'u1' })
    const u2 = await seedDefaultCategoriesIfEmpty({ userId: 'u2' })
    expect(u2).toBe(14)
  })

  it('exports DEFAULT_CATEGORIES with the expected names + icons', () => {
    const names = DEFAULT_CATEGORIES.map(c => c.name)
    expect(names).toContain('Food')
    expect(names).toContain('Rent')
    expect(names).toContain('Salary')
    expect(DEFAULT_CATEGORIES.find(c => c.name === 'Food')?.icon).toBe('🍴')
  })
})
```

- [ ] **Step 2: Run — verify failure**

```powershell
pnpm test -- tests/seed-categories.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement the seeder**

Create `src/lib/seed-categories.ts`:

```typescript
import { db } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import type { CategoryPayload } from '@/lib/op-schemas/category'

type SeedCategory = Omit<CategoryPayload, 'sort_order'>

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Food',           kind: 'spend',  icon: '🍴' },
  { name: 'Transport',      kind: 'spend',  icon: '🚗' },
  { name: 'Rent',           kind: 'spend',  icon: '🏠' },
  { name: 'Bills',          kind: 'spend',  icon: '💡' },
  { name: 'Shopping',       kind: 'spend',  icon: '🛍️' },
  { name: 'Entertainment',  kind: 'spend',  icon: '🎬' },
  { name: 'Health',         kind: 'spend',  icon: '🏥' },
  { name: 'Personal',       kind: 'spend',  icon: '👤' },
  { name: 'Misc',           kind: 'spend',  icon: '⋯' },
  { name: 'Salary',         kind: 'income', icon: '💼' },
  { name: 'Freelance',      kind: 'income', icon: '💻' },
  { name: 'Refund',         kind: 'income', icon: '↩️' },
  { name: 'Investment',     kind: 'income', icon: '📈' },
  { name: 'Gift',           kind: 'income', icon: '🎁' },
]

export async function seedDefaultCategoriesIfEmpty({ userId }: { userId: string }): Promise<number> {
  const existing = await db.categories.where('user_id').equals(userId).count()
  if (existing > 0) return 0

  let inserted = 0
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i]
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: { ...cat, sort_order: i },
      user_id: userId,
    })
    await applyLocalOp(op)
    inserted++
  }
  return inserted
}
```

- [ ] **Step 4: Run — verify tests pass**

```powershell
pnpm test -- tests/seed-categories.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/seed-categories.ts tests/seed-categories.test.ts
git commit -m "feat(categories): idempotent default-category seeder"
```

---

## Task 8: use-categories hook + category-picker component

**Files:**
- Create: `src/hooks/use-categories.ts`
- Create: `src/components/category-picker.tsx`

- [ ] **Step 1: Implement the hook**

Create `src/hooks/use-categories.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CategoryRow } from '@/lib/dexie'

export function useCategories(userId: string | undefined, kind?: 'spend' | 'income'): CategoryRow[] {
  return useLiveQuery<CategoryRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.categories
        .where(kind ? '[user_id+kind]' : 'user_id')
        .equals(kind ? [userId, kind] : userId)
        .toArray()
      return all
        .filter(c => !c.deleted_at && !c.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order)
    },
    [userId, kind],
    [],
  ) ?? []
}
```

- [ ] **Step 2: Implement the picker**

Create `src/components/category-picker.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { cn } from '@/lib/utils'

type Props = {
  userId: string
  kind: 'spend' | 'income'
  selectedId: string | null
  onSelect: (id: string) => void
}

export function CategoryPicker({ userId, kind, selectedId, onSelect }: Props) {
  const categories = useCategories(userId, kind)
  const [query, setQuery] = useState('')

  const filtered = query
    ? categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search categories…"
        className="rounded-md border bg-background px-3 py-1 text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition',
              selectedId === c.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:bg-accent',
            )}
          >
            {c.icon && <span className="mr-1">{c.icon}</span>}{c.name}
          </button>
        ))}
        {filtered.length === 0 && <span className="text-xs text-muted-foreground">No matches.</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck**

```powershell
pnpm typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```powershell
git add src/hooks/use-categories.ts src/components/category-picker.tsx
git commit -m "feat(categories): use-categories hook + CategoryPicker component"
```

---

## Task 9: Settings page with category CRUD

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/categories/page.tsx`

- [ ] **Step 1: Settings index**

Create `src/app/settings/page.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Link href="/settings/categories">
        <Card className="hover:bg-accent transition">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Add, rename, archive your spend + income categories.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link href="/settings/recurring">
        <Card className="hover:bg-accent transition">
          <CardHeader>
            <CardTitle>Recurring rules</CardTitle>
            <CardDescription>Manage scheduled spend + income (rent, salary, subscriptions).</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link href="/app" className="text-sm text-muted-foreground hover:underline">← Back to Pulse</Link>
    </main>
  )
}
```

- [ ] **Step 2: Categories page**

Create `src/app/settings/categories/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useCategories } from '@/hooks/use-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CategoriesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [kind, setKind] = useState<'spend' | 'income'>('spend')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const categories = useCategories(userId ?? undefined)
  const spend  = categories.filter(c => c.kind === 'spend')
  const income = categories.filter(c => c.kind === 'income')

  async function addCategory() {
    if (!userId || !newName.trim()) return
    const sortOrder = (kind === 'spend' ? spend.length : income.length)
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: { name: newName.trim(), kind, sort_order: sortOrder },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveCategory(id: string) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: id,
      op_type: 'update',
      payload: { is_archived: 1 },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category…" />
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'spend' | 'income')}
            className="rounded-md border bg-background px-2 text-sm"
          >
            <option value="spend">Spend</option>
            <option value="income">Income</option>
          </select>
          <Button onClick={addCategory}>Add</Button>
        </div>
      </section>

      <CategorySection title="Spend" categories={spend} onArchive={archiveCategory} />
      <CategorySection title="Income" categories={income} onArchive={archiveCategory} />
    </main>
  )
}

function CategorySection({
  title, categories, onArchive,
}: { title: string; categories: ReturnType<typeof useCategories>; onArchive: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="divide-y divide-border rounded-md border">
        {categories.length === 0 && <li className="p-3 text-sm text-muted-foreground">No {title.toLowerCase()} categories.</li>}
        {categories.map(c => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span className="text-sm">{c.icon && <span className="mr-1">{c.icon}</span>}{c.name}</span>
            <Button size="sm" variant="ghost" onClick={() => onArchive(c.id)}>Archive</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 3: Manual smoke (PWA dev server)**

```powershell
pnpm dev
```

In another shell, open `http://localhost:3000/settings/categories` (after signing in via `/login`). Confirm:
1. 14 categories appear after first visit (because Task 12 wires the seed call on app load — for now, manually call `seedDefaultCategoriesIfEmpty` from the browser devtools console: `await (await import('/src/lib/seed-categories.ts')).seedDefaultCategoriesIfEmpty({ userId: '<your-id>' })` — or skip this verification until Task 12 wires it up).

- [ ] **Step 4: Commit**

```powershell
git add src/app/settings
git commit -m "feat(settings): categories page with add + archive"
```

---

**Sub-phase 1.1 done.** Smoke-test: log in on phone + desktop, create a category on one, see it appear on the other within 10s (background-sync interval).

---

# Phase 1.2 — Manual money entry

## Task 10: use-money-entries hook + use-undo-stack hook

**Files:**
- Create: `src/hooks/use-money-entries.ts`
- Create: `src/hooks/use-undo-stack.ts`

- [ ] **Step 1: Money entries hook**

Create `src/hooks/use-money-entries.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MoneyEntryRow } from '@/lib/dexie'

export type PeriodRange = { from: string; to: string }     // ISO timestamps

export function useMoneyEntries(userId: string | undefined, range?: PeriodRange): MoneyEntryRow[] {
  return useLiveQuery<MoneyEntryRow[]>(
    async () => {
      if (!userId) return []
      let q
      if (range) {
        q = db.money_entries
          .where('[user_id+occurred_at]')
          .between([userId, range.from], [userId, range.to])
      } else {
        q = db.money_entries.where('user_id').equals(userId)
      }
      const all = await q.toArray()
      return all
        .filter(e => !e.deleted_at)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    },
    [userId, range?.from, range?.to],
    [],
  ) ?? []
}
```

- [ ] **Step 2: Undo stack hook**

Create `src/hooks/use-undo-stack.ts`:

```typescript
'use client'

import { useCallback, useRef, useState } from 'react'

type UndoEntry = {
  id: string
  label: string
  undo: () => Promise<void>
  expiresAt: number
}

export function useUndoStack(ttlMs = 5000) {
  const [entries, setEntries] = useState<UndoEntry[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const push = useCallback((label: string, undo: () => Promise<void>) => {
    const id = crypto.randomUUID()
    const entry: UndoEntry = { id, label, undo, expiresAt: Date.now() + ttlMs }
    setEntries(prev => [...prev, entry])
    const timer = setTimeout(() => {
      setEntries(prev => prev.filter(e => e.id !== id))
      timersRef.current.delete(id)
    }, ttlMs)
    timersRef.current.set(id, timer)
  }, [ttlMs])

  const trigger = useCallback(async (id: string) => {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setEntries(prev => prev.filter(e => e.id !== id))
    await entry.undo()
  }, [entries])

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  return { entries, push, trigger, dismiss }
}
```

- [ ] **Step 3: Typecheck**

```powershell
pnpm typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```powershell
git add src/hooks/use-money-entries.ts src/hooks/use-undo-stack.ts
git commit -m "feat(money): live-query hook + undo-stack hook"
```

---

## Task 11: ConfirmationChip component

**Files:**
- Create: `src/components/confirmation-chip.tsx`

- [ ] **Step 1: Component**

Create `src/components/confirmation-chip.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/components/category-picker'
import { cn } from '@/lib/utils'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { CategoryRow } from '@/lib/dexie'

export type ChipDraft = MoneyPayload & {
  // Display-only fields the chip may need:
  draftCategoryName?: string
}

type Props = {
  userId: string
  draft: ChipDraft
  categoryById: Map<string, CategoryRow>
  onConfirm: (final: ChipDraft, makeRecurring: boolean) => Promise<void>
  onCancel: () => void
}

export function ConfirmationChip({ userId, draft, categoryById, onConfirm, onCancel }: Props) {
  const [d, setD] = useState<ChipDraft>(draft)
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category'>(null)
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [busy, setBusy] = useState(false)

  const major = (d.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const symbol = currencySymbol(d.currency)
  const cat = d.category_id ? categoryById.get(d.category_id) : undefined

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm(d, makeRecurring) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className={cn(
          'font-semibold uppercase tracking-wide',
          d.direction === 'out' ? 'text-rose-500' : 'text-emerald-500',
        )}>
          {d.direction === 'out' ? '💸 Spend' : '💰 Income'}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:underline"
          onClick={() => setD(s => ({ ...s, direction: s.direction === 'out' ? 'in' : 'out' }))}
        >
          flip
        </button>
      </div>

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
          className="mb-3 text-3xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('amount')}
          className="mb-3 block text-3xl font-semibold tabular-nums"
        >
          {symbol}{major}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditingField('category')}
          className="rounded-md border bg-muted px-2 py-0.5 text-xs"
        >
          {cat ? `${cat.icon ?? ''} ${cat.name}` : 'Pick category…'}
        </button>
        {editingField === 'description' ? (
          <Input
            autoFocus
            defaultValue={d.description ?? ''}
            onBlur={(e) => {
              setD(s => ({ ...s, description: e.currentTarget.value || null }))
              setEditingField(null)
            }}
            className="h-7 max-w-[200px] text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('description')}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            {d.description || '+ description'}
          </button>
        )}
      </div>

      {editingField === 'category' && (
        <div className="mb-3 rounded-md border bg-background p-2">
          <CategoryPicker
            userId={userId}
            kind={d.direction === 'out' ? 'spend' : 'income'}
            selectedId={d.category_id ?? null}
            onSelect={(id) => { setD(s => ({ ...s, category_id: id })); setEditingField(null) }}
          />
        </div>
      )}

      <label className="mb-3 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span>Make recurring</span>
        <input
          type="checkbox"
          checked={makeRecurring}
          onChange={e => setMakeRecurring(e.currentTarget.checked)}
        />
      </label>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy}>
          Confirm {symbol}{major}
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function currencySymbol(code: string): string {
  return { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SGD: 'S$', JPY: '¥', AUD: 'A$', CAD: 'C$' }[code] ?? code
}
```

- [ ] **Step 2: Typecheck**

```powershell
pnpm typecheck
```

Expected: green. (The "Make recurring" toggle is stubbed for 1.4 — it doesn't actually create a rule yet.)

- [ ] **Step 3: Commit**

```powershell
git add src/components/confirmation-chip.tsx
git commit -m "feat(money): ConfirmationChip with inline-edit fields + recurring toggle stub"
```

---

## Task 12: /api/agent route (typed text → parsed payload)

> Note: this route is the typed-text fallback for `/api/voice`. It calls the same `routeIntent` + `parseMoneyEntry` agents that voice uses, but skips Whisper. **Stub now — wire to real agents in Task 19.**

**Files:**
- Create: `src/app/api/agent/route.ts`
- Create: `tests/api/agent-route.test.ts`

- [ ] **Step 1: Failing test (stub mode)**

Create `tests/api/agent-route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/agent/route'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { GROQ_API_KEY: 'test', DB: null } }),
}))

describe('/api/agent', () => {
  it('returns 401 without a session', async () => {
    const { getSession } = await import('@/lib/auth')
    ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST', body: JSON.stringify({ text: 'spent 80 on chai' }),
      headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid body', async () => {
    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(400)
  })

  it('echoes a parsed-payload shape (stub mode for Task 12)', async () => {
    const res = await POST(new Request('http://x/api/agent', {
      method: 'POST',
      body: JSON.stringify({ text: 'spent 80 on chai', categories: [] }),
      headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { transcript: string; intent: string; payload: unknown }
    expect(body.transcript).toBe('spent 80 on chai')
  })
})
```

- [ ] **Step 2: Run — verify failure (module not found)**

```powershell
pnpm test -- tests/api/agent-route.test.ts
```

- [ ] **Step 3: Implement the stub route**

Create `src/app/api/agent/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  text: z.string().min(1).max(500),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['spend', 'income']),
  })).optional().default([]),
})

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Stub: real agent dispatch lands in Task 19. For now, return a minimal payload
  // that makes the chip render — the engineer running this plan will manually
  // edit fields. Once Task 19 lands, this stub is replaced with:
  //
  //   const router = await routeIntent(parsed.data.text, GROQ_API_KEY)
  //   if (router.intent === 'log_money') {
  //     const payload = await parseMoneyEntry(parsed.data.text, parsed.data.categories, GROQ_API_KEY)
  //     return NextResponse.json({ transcript: parsed.data.text, intent: 'log_money', confidence: router.confidence, payload })
  //   }
  return NextResponse.json({
    transcript: parsed.data.text,
    intent: 'log_money',
    confidence: 0.5,
    payload: {
      amount: 0, currency: 'INR', direction: 'out',
      occurred_at: new Date().toISOString(),
      source: 'manual',
      raw_input: parsed.data.text,
    },
  })
}
```

- [ ] **Step 4: Run — verify tests pass**

```powershell
pnpm test -- tests/api/agent-route.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/agent/route.ts tests/api/agent-route.test.ts
git commit -m "feat(api): /api/agent stub route (wires to real agents in Task 19)"
```

---

## Task 13: Replace WidgetForm with manual money flow on /app

**Files:**
- Modify: `src/app/app/page.tsx`
- Create: `src/components/money-list.tsx`
- Delete: `src/components/widget-form.tsx`

- [ ] **Step 1: Implement MoneyList (no edit menu yet — that's 1.5)**

Create `src/components/money-list.tsx`:

```typescript
'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'
import { useUndoStack } from '@/hooks/use-undo-stack'
import type { MoneyEntryRow } from '@/lib/dexie'

type Props = { userId: string }

export function MoneyList({ userId }: Props) {
  const entries = useMoneyEntries(userId)
  const categories = useCategories(userId)
  const undo = useUndoStack()

  const categoryById = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories],
  )

  async function deleteEntry(e: MoneyEntryRow) {
    const op = await generateOp({
      entity_kind: 'money', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))

    undo.push(
      `Deleted ${formatAmount(e)}`,
      async () => {
        const undoOp = await generateOp({
          entity_kind: 'money', entity_id: e.id,
          op_type: 'update', payload: { description: e.description ?? null },
          user_id: userId,
        })
        await applyLocalOp(undoOp)
        pushPullOnce({ userId }).catch(err => console.error('sync', err))
      },
    )
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-md border">
        {entries.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">No entries yet. Tap the mic above (Phase 1.3) or type below.</li>
        )}
        {entries.map(e => {
          const cat = e.category_id ? categoryById.get(e.category_id) : undefined
          return (
            <li key={e.id} className="flex items-center justify-between p-3 text-sm">
              <div className="flex flex-col">
                <span className={e.direction === 'out' ? 'text-rose-600' : 'text-emerald-600'}>
                  {formatAmount(e)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cat ? `${cat.icon ?? ''} ${cat.name}` : 'no category'}{e.description ? ` · ${e.description}` : ''}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteEntry(e)}>Delete</Button>
            </li>
          )
        })}
      </ul>

      {/* Undo toast stack */}
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {undo.entries.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-1.5 text-xs shadow">
            <span>{u.label}</span>
            <button type="button" className="font-semibold text-blue-600" onClick={() => undo.trigger(u.id)}>Undo</button>
            <button type="button" className="text-muted-foreground" onClick={() => undo.dismiss(u.id)}>×</button>
          </div>
        ))}
      </div>
    </>
  )
}

function formatAmount(e: MoneyEntryRow): string {
  const major = (e.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const sym   = ({ INR: '₹', USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[e.currency] ?? e.currency
  return `${e.direction === 'out' ? '-' : '+'}${sym}${major}`
}
```

- [ ] **Step 2: Rewrite the app page**

Replace `src/app/app/page.tsx`:

```typescript
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmationChip, type ChipDraft } from '@/components/confirmation-chip'
import { MoneyList } from '@/components/money-list'
import { useCategories } from '@/hooks/use-categories'
import { seedDefaultCategoriesIfEmpty } from '@/lib/seed-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import type { MoneyPayload } from '@/lib/op-schemas/money'

export default function AppPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<ChipDraft | null>(null)
  const [parsing, setParsing] = useState(false)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUser({ id: res.data.user.id, email: res.data.user.email })
    })
  }, [router])

  // Seed categories on first sign-in (idempotent)
  useEffect(() => {
    if (!user) return
    seedDefaultCategoriesIfEmpty({ userId: user.id })
      .then(n => { if (n > 0) pushPullOnce({ userId: user.id }).catch(console.error) })
      .catch(err => console.error('seed', err))
  }, [user])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
    }, 10_000)
    return () => clearInterval(interval)
  }, [user])

  const categories = useCategories(user?.id)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  async function parseText() {
    if (!text.trim() || !user) return
    setParsing(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          categories: categories.map(c => ({ id: c.id, name: c.name, kind: c.kind })),
        }),
      })
      if (!res.ok) throw new Error(`/api/agent ${res.status}`)
      const data = await res.json() as { payload: MoneyPayload }
      setDraft(data.payload as ChipDraft)
      setText('')
    } catch (err) {
      console.error(err)
      // Fall through to a fully-blank draft the user fills in manually
      setDraft({
        amount: 0, currency: 'INR', direction: 'out',
        occurred_at: new Date().toISOString(),
        source: 'manual',
        raw_input: text.trim(),
      })
      setText('')
    } finally {
      setParsing(false)
    }
  }

  async function confirmEntry(final: ChipDraft, _makeRecurring: boolean) {
    if (!user) return
    // Task 22 wires `makeRecurring` to actually create a recurring rule.
    const op = await generateOp({
      entity_kind: 'money',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        amount: final.amount,
        currency: final.currency,
        direction: final.direction,
        category_id: final.category_id ?? null,
        description: final.description ?? null,
        occurred_at: final.occurred_at,
        source: final.source,
        raw_input: final.raw_input ?? null,
      },
      user_id: user.id,
    })
    await applyLocalOp(op)
    setDraft(null)
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }

  if (!user) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pulse</h1>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-xs text-muted-foreground hover:underline">Settings</Link>
          <Button size="sm" variant="outline"
            onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
            Sign out
          </Button>
        </div>
      </header>
      <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>

      {/* Voice button slot — wired in Task 20 */}
      <div className="rounded-md border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
        Voice input lands in Phase 1.3. Type below for now.
      </div>

      {/* Manual entry */}
      <form
        onSubmit={(e) => { e.preventDefault(); parseText() }}
        className="flex gap-2"
      >
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='spent 80 on chai'
          disabled={parsing || draft !== null}
        />
        <Button type="submit" disabled={parsing || draft !== null || !text.trim()}>
          {parsing ? 'Parsing…' : 'Parse'}
        </Button>
      </form>

      {/* Confirmation chip */}
      {draft && (
        <ConfirmationChip
          userId={user.id}
          draft={draft}
          categoryById={categoryById}
          onConfirm={confirmEntry}
          onCancel={() => setDraft(null)}
        />
      )}

      <MoneyList userId={user.id} />
    </main>
  )
}
```

- [ ] **Step 3: Delete the Phase 0 widget form**

```powershell
Remove-Item src/components/widget-form.tsx
```

(Tests that imported it must be updated. Check first):

```powershell
pnpm exec rg "widget-form" -l
```

If any test files reference it, delete those tests too — the Phase 0 widget toy is being retired in Phase 1.

- [ ] **Step 4: Typecheck + run all tests**

```powershell
pnpm typecheck
pnpm test
```

Expected: green.

- [ ] **Step 5: Manual smoke**

```powershell
pnpm dev
```

In a browser:
1. `/login` → sign in
2. `/app` → seed runs (14 categories appear in `/settings/categories`)
3. Type `spent 80 on chai` → press Parse → chip appears (amount=₹0 because the stub agent returns 0)
4. Tap the amount → edit to 80 → tap a category → tap Confirm
5. Entry appears in the list
6. Open `/app` on a second device (phone) → same entry shows within 10s

- [ ] **Step 6: Commit**

```powershell
git add src/app/app/page.tsx src/components/money-list.tsx
git rm src/components/widget-form.tsx
git commit -m "feat(app): replace widget form with manual money entry + chip + list"
```

---

**Sub-phase 1.2 done.** Manual money entry works end-to-end. The stub agent returns a 0-amount draft — the user edits the amount and confirms. Sync verified phone↔desktop. Next: real agents (voice + parsing).

---

# Phase 1.3 — Voice + agents

## Task 14: llm-client.ts — Groq SDK wrapper with retry + JSON mode

**Files:**
- Create: `src/lib/agents/llm-client.ts`
- Create: `tests/agents/llm-client.test.ts`

- [ ] **Step 1: Failing tests**

Create `tests/agents/llm-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callGroqJSON, withRetry } from '@/lib/agents/llm-client'

describe('callGroqJSON', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('parses a valid JSON response', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"intent":"log_money","confidence":0.9}' } }],
      }) } },
    }
    const out = await callGroqJSON({
      client: fakeGroq as never,
      model: 'llama-3.1-8b-instant',
      system: 'sys', user: 'usr',
    })
    expect(out).toEqual({ intent: 'log_money', confidence: 0.9 })
  })

  it('throws if the response is not parseable JSON', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }],
      }) } },
    }
    await expect(callGroqJSON({
      client: fakeGroq as never,
      model: 'llama-3.1-8b-instant',
      system: 'sys', user: 'usr',
    })).rejects.toThrow(/parse/i)
  })

  it('throws if the response is empty', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
    }
    await expect(callGroqJSON({
      client: fakeGroq as never,
      model: 'llama-3.1-8b-instant',
      system: 'sys', user: 'usr',
    })).rejects.toThrow(/no choice/i)
  })
})

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    expect(await withRetry(fn, { attempts: 3, baseMs: 1 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries up to N times then throws the last error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1st'))
      .mockRejectedValueOnce(new Error('2nd'))
      .mockResolvedValue('ok-on-3rd')
    expect(await withRetry(fn, { attempts: 3, baseMs: 1 })).toBe('ok-on-3rd')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable errors', async () => {
    const err = Object.assign(new Error('bad'), { status: 400 })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { attempts: 3, baseMs: 1 })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run — verify failure**

```powershell
pnpm test -- tests/agents/llm-client.test.ts
```

- [ ] **Step 3: Implement the client wrapper**

Create `src/lib/agents/llm-client.ts`:

```typescript
import Groq from 'groq-sdk'

export type GroqModel =
  | 'llama-3.1-8b-instant'
  | 'llama-3.1-70b-versatile'
  | 'whisper-large-v3-turbo'

export function makeGroqClient(apiKey: string): Groq {
  return new Groq({ apiKey })
}

type CallArgs = {
  client: Groq
  model: GroqModel
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}

export async function callGroqJSON<T = unknown>(args: CallArgs): Promise<T> {
  const completion = await args.client.chat.completions.create({
    model: args.model,
    response_format: { type: 'json_object' },
    temperature: args.temperature ?? 0,
    max_tokens: args.maxTokens ?? 512,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
  })

  const choice = completion.choices?.[0]
  if (!choice) throw new Error('groq: no choice returned')
  const text = choice.message?.content
  if (!text) throw new Error('groq: empty content')

  try { return JSON.parse(text) as T }
  catch (err) { throw new Error(`groq: failed to parse JSON response — ${(err as Error).message}\nRaw: ${text}`) }
}

type RetryArgs = { attempts: number; baseMs: number }

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryArgs): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < opts.attempts; i++) {
    try { return await fn() }
    catch (err) {
      lastErr = err
      const status = (err as { status?: number }).status
      if (status !== undefined && !RETRYABLE_STATUS.has(status)) throw err
      if (i === opts.attempts - 1) break
      const delay = opts.baseMs * Math.pow(3, i)   // 100 → 300 → 900 ms (or 3s/9s/27s for production)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}
```

- [ ] **Step 4: Run — verify tests pass**

```powershell
pnpm test -- tests/agents/llm-client.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/agents/llm-client.ts tests/agents/llm-client.test.ts
git commit -m "feat(agents): Groq client wrapper with retry + JSON mode"
```

---

## Task 15: whisper.ts — audio transcription

**Files:**
- Create: `src/lib/agents/whisper.ts`
- Create: `tests/agents/whisper.test.ts`

- [ ] **Step 1: Failing tests**

Create `tests/agents/whisper.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { groqWhisper } from '@/lib/agents/whisper'

describe('groqWhisper', () => {
  it('returns transcript + duration on success', async () => {
    const fakeGroq = {
      audio: { transcriptions: { create: vi.fn().mockResolvedValue({
        text: 'spent 80 on chai',
        language: 'en',
        duration: 1.8,
      }) } },
    }
    const blob = new Blob(['fake audio'], { type: 'audio/webm' })
    const out = await groqWhisper({ client: fakeGroq as never, blob, filename: 'voice.webm' })
    expect(out.transcript).toBe('spent 80 on chai')
    expect(out.lang).toBe('en')
    expect(out.duration_ms).toBe(1800)
  })

  it('throws on empty transcript', async () => {
    const fakeGroq = {
      audio: { transcriptions: { create: vi.fn().mockResolvedValue({ text: '   ' }) } },
    }
    const blob = new Blob(['fake audio'])
    await expect(groqWhisper({ client: fakeGroq as never, blob, filename: 'voice.webm' }))
      .rejects.toThrow(/empty transcript/i)
  })
})
```

- [ ] **Step 2: Implement**

Create `src/lib/agents/whisper.ts`:

```typescript
import type Groq from 'groq-sdk'

type Args = {
  client: Groq
  blob: Blob
  filename: string
}

export type WhisperResult = {
  transcript: string
  lang?: string
  duration_ms?: number
}

export async function groqWhisper({ client, blob, filename }: Args): Promise<WhisperResult> {
  // Groq SDK accepts a File-like object (Web File or a Blob with a filename).
  // We construct a File so the SDK serializes a proper multipart upload.
  const file = blob instanceof File ? blob : new File([blob], filename, { type: blob.type || 'audio/webm' })

  const res = await client.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    response_format: 'verbose_json',
    temperature: 0,
    language: 'en',  // hint — Whisper still detects code-switching automatically
  })

  const text = (res as { text?: string }).text?.trim() ?? ''
  if (!text) throw new Error('whisper: empty transcript')

  const lang = (res as { language?: string }).language
  const duration = (res as { duration?: number }).duration
  return {
    transcript: text,
    lang,
    duration_ms: typeof duration === 'number' ? Math.round(duration * 1000) : undefined,
  }
}
```

- [ ] **Step 3: Run tests**

```powershell
pnpm test -- tests/agents/whisper.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/agents/whisper.ts tests/agents/whisper.test.ts
git commit -m "feat(agents): Whisper transcription helper"
```

---

## Task 16: Router agent — intent classifier (Llama 8B)

**Files:**
- Create: `src/lib/agents/prompts/router.ts`
- Create: `src/lib/agents/schemas/router-response.ts`
- Create: `src/lib/agents/router.ts`
- Create: `tests/agents/router.test.ts`

- [ ] **Step 1: Failing tests**

Create `tests/agents/router.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { routeIntent } from '@/lib/agents/router'

function mockGroqWithJSON(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('routeIntent', () => {
  it('parses a log_money intent', async () => {
    const client = mockGroqWithJSON({ intent: 'log_money', confidence: 0.95 })
    const r = await routeIntent({ client: client as never, text: 'spent 80 on chai' })
    expect(r.intent).toBe('log_money')
    expect(r.confidence).toBeGreaterThan(0.9)
  })

  it('parses a query_money intent', async () => {
    const client = mockGroqWithJSON({ intent: 'query_money', confidence: 0.88 })
    const r = await routeIntent({ client: client as never, text: 'how much did I spend last week' })
    expect(r.intent).toBe('query_money')
  })

  it('parses a chat intent', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 0.7 })
    const r = await routeIntent({ client: client as never, text: 'hi' })
    expect(r.intent).toBe('chat')
  })

  it('rejects unknown intent value', async () => {
    const client = mockGroqWithJSON({ intent: 'something_else', confidence: 0.9 })
    await expect(routeIntent({ client: client as never, text: 'x' })).rejects.toThrow()
  })

  it('rejects out-of-range confidence', async () => {
    const client = mockGroqWithJSON({ intent: 'chat', confidence: 1.5 })
    await expect(routeIntent({ client: client as never, text: 'x' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Implement the response schema**

Create `src/lib/agents/schemas/router-response.ts`:

```typescript
import { z } from 'zod'

export const INTENTS = ['log_money', 'query_money', 'chat'] as const

export const RouterResponseSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
})

export type RouterResponse = z.infer<typeof RouterResponseSchema>
```

- [ ] **Step 3: Implement the system prompt + few-shots**

Create `src/lib/agents/prompts/router.ts`:

```typescript
export const ROUTER_SYSTEM_PROMPT = `You classify a single user utterance into one of three intents for a personal-finance voice assistant.

Intents:
- "log_money"   — the user is logging a transaction they made (spent, paid, got, received, bought)
- "query_money" — the user is asking about their existing transactions (how much, last week, by category)
- "chat"        — small talk, greetings, instructions, or anything that isn't logging or querying money

Rules:
- Always return a confidence between 0.0 and 1.0
- Return ONLY this JSON object (no prose, no markdown, no explanation):
  { "intent": "log_money" | "query_money" | "chat", "confidence": <number> }

Examples:
User: "spent 80 on chai"             → {"intent":"log_money","confidence":0.98}
User: "I just paid the rent"         → {"intent":"log_money","confidence":0.96}
User: "got salary 85000 yesterday"   → {"intent":"log_money","confidence":0.97}
User: "bought a book for 350"        → {"intent":"log_money","confidence":0.96}
User: "took uber to work, 220"       → {"intent":"log_money","confidence":0.94}
User: "how much did I spend on food" → {"intent":"query_money","confidence":0.95}
User: "what was my biggest expense"  → {"intent":"query_money","confidence":0.93}
User: "show last month"              → {"intent":"query_money","confidence":0.9}
User: "how am I doing"               → {"intent":"query_money","confidence":0.7}
User: "hi"                           → {"intent":"chat","confidence":0.95}
User: "what can you do"              → {"intent":"chat","confidence":0.85}
User: "thanks"                       → {"intent":"chat","confidence":0.92}
User: "set a budget for food"        → {"intent":"chat","confidence":0.6}
User: "delete that last one"         → {"intent":"chat","confidence":0.55}
`
```

- [ ] **Step 4: Implement the router function**

Create `src/lib/agents/router.ts`:

```typescript
import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { ROUTER_SYSTEM_PROMPT } from './prompts/router'
import { RouterResponseSchema, type RouterResponse } from './schemas/router-response'

type Args = {
  client: Groq
  text: string
}

export async function routeIntent({ client, text }: Args): Promise<RouterResponse> {
  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'llama-3.1-8b-instant',
      system: ROUTER_SYSTEM_PROMPT,
      user: text,
      temperature: 0,
      maxTokens: 64,
    }),
    { attempts: 3, baseMs: 300 },
  )

  const parsed = RouterResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`router: invalid response shape — ${parsed.error.message}`)
  }
  return parsed.data
}
```

- [ ] **Step 5: Run tests**

```powershell
pnpm test -- tests/agents/router.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/agents/router.ts src/lib/agents/prompts/router.ts src/lib/agents/schemas/router-response.ts tests/agents/router.test.ts
git commit -m "feat(agents): Router intent classifier (Llama 3.1 8B)"
```

---

## Task 17: money_agent — payload parser (Llama 70B)

**Files:**
- Create: `src/lib/agents/prompts/money-agent.ts`
- Create: `src/lib/agents/schemas/money-agent-response.ts`
- Create: `src/lib/agents/money-agent.ts`

> Tests for money_agent are the adversarial fixture set — that's Task 18.

- [ ] **Step 1: Response schema**

Create `src/lib/agents/schemas/money-agent-response.ts`:

```typescript
import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export const MoneyAgentResponseSchema = z.object({
  amount: z.number().int().nonnegative(),                  // smallest unit (paise/cents)
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_name: z.string().min(1).nullable(),             // null if AI couldn't decide
  description: z.string().max(120).nullable(),
  occurred_at: z.string().datetime(),                      // ISO 8601
})

export type MoneyAgentResponse = z.infer<typeof MoneyAgentResponseSchema>
```

- [ ] **Step 2: System prompt template**

Create `src/lib/agents/prompts/money-agent.ts`:

```typescript
type Cat = { name: string; kind: 'spend' | 'income' }

export function buildMoneyAgentSystemPrompt({
  categories,
  nowIso,
  defaultCurrency = 'INR',
}: {
  categories: Cat[]
  nowIso: string
  defaultCurrency?: string
}): string {
  const spendList  = categories.filter(c => c.kind === 'spend').map(c => `"${c.name}"`).join(', ')  || '(none)'
  const incomeList = categories.filter(c => c.kind === 'income').map(c => `"${c.name}"`).join(', ') || '(none)'

  return `You extract a structured transaction from a single user utterance.

Today (ISO): ${nowIso}
Default currency: ${defaultCurrency}

Active spend categories: ${spendList}
Active income categories: ${incomeList}

Rules:
1. Return ONLY this JSON object (no prose, no markdown):
   {
     "amount": <integer in smallest unit — paise for INR, cents for USD/EUR/etc>,
     "currency": <ISO 4217 — "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD" | "JPY" | "AUD" | "CAD">,
     "direction": <"out" | "in">,
     "category_name": <one of the active categories above, exact spelling — or null if no good match>,
     "description": <≤6-word phrase about what the money was for — or null>,
     "occurred_at": <ISO 8601 timestamp>
   }

2. Amount conversion:
   - INR: rupees → multiply by 100 to get paise. "₹80" or "80 rupees" → amount=8000, currency=INR
   - USD/EUR/etc: dollars/euros → multiply by 100 to get cents. "$5.50" → amount=550, currency=USD
   - Lakhs / crores (Indian English): "1 lakh" → 100000 rupees → amount=10000000. "1.5 crores" → 15000000 rupees → 1500000000 paise.
   - "k" suffix: "80k" in INR context → 80000 rupees → amount=8000000
   - JPY has no minor unit — use amount as-is (e.g. "1500 yen" → amount=1500, currency=JPY)

3. Direction (verb cues):
   - OUT (money leaving): "spent", "paid", "bought", "gave", "owe", "loaned", "took"
   - IN  (money coming in): "got", "received", "earned", "salary credited", "refund", "gift", "freelance income"
   - Default to OUT if ambiguous

4. category_name: pick the BEST match from the appropriate list above.
   - spend utterance → pick from active spend categories
   - income utterance → pick from active income categories
   - "samosa", "lunch", "groceries", "biryani", "chai" → "Food"
   - "uber", "ola", "metro", "petrol", "fuel" → "Transport"
   - "netflix", "movie", "spotify", "concert" → "Entertainment"
   - "Boss", "tcs deposit", "monthly salary" → "Salary"
   - "freelance project", "client paid" → "Freelance"
   - If no category fits, return null (NOT a made-up name)

5. description: short noun phrase capturing the specifics. "chai", "uber to airport", "netflix subscription". Omit category words (don't say "food chai"). null if you have nothing to add.

6. occurred_at:
   - "yesterday" → 24 hours before nowIso, same wall-clock time
   - "last Tuesday" → most recent past Tuesday at noon UTC
   - "this morning" → today at 09:00 local UTC
   - "an hour ago" → nowIso minus 1 hour
   - No time cue → use nowIso

7. If you cannot detect any amount, return amount=0 (the UI will prompt the user).

Examples:
User: "spent 80 on chai"
→ {"amount":8000,"currency":"INR","direction":"out","category_name":"Food","description":"chai","occurred_at":"${nowIso}"}

User: "got salary 85000 yesterday"
→ {"amount":8500000,"currency":"INR","direction":"in","category_name":"Salary","description":null,"occurred_at":"<yesterday at nowIso time>"}

User: "took uber to airport 350"
→ {"amount":35000,"currency":"INR","direction":"out","category_name":"Transport","description":"uber to airport","occurred_at":"${nowIso}"}

User: "5 bucks for coffee"
→ {"amount":500,"currency":"USD","direction":"out","category_name":"Food","description":"coffee","occurred_at":"${nowIso}"}

User: "1 lakh down payment"
→ {"amount":10000000,"currency":"INR","direction":"out","category_name":null,"description":"down payment","occurred_at":"${nowIso}"}

User: "netflix 199 monthly"
→ {"amount":19900,"currency":"INR","direction":"out","category_name":"Entertainment","description":"netflix subscription","occurred_at":"${nowIso}"}

User: "freelance client paid 50k"
→ {"amount":5000000,"currency":"INR","direction":"in","category_name":"Freelance","description":null,"occurred_at":"${nowIso}"}
`
}
```

- [ ] **Step 3: Money agent function**

Create `src/lib/agents/money-agent.ts`:

```typescript
import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildMoneyAgentSystemPrompt } from './prompts/money-agent'
import { MoneyAgentResponseSchema, type MoneyAgentResponse } from './schemas/money-agent-response'

type Args = {
  client: Groq
  text: string
  categories: Array<{ name: string; kind: 'spend' | 'income' }>
  nowIso?: string
  defaultCurrency?: string
}

export async function parseMoneyEntry({
  client, text, categories, nowIso, defaultCurrency,
}: Args): Promise<MoneyAgentResponse> {
  const system = buildMoneyAgentSystemPrompt({
    categories,
    nowIso: nowIso ?? new Date().toISOString(),
    defaultCurrency,
  })

  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'llama-3.1-70b-versatile',
      system,
      user: text,
      temperature: 0,
      maxTokens: 256,
    }),
    { attempts: 3, baseMs: 500 },
  )

  const parsed = MoneyAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`money_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
```

- [ ] **Step 4: Typecheck**

```powershell
pnpm typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/agents/money-agent.ts src/lib/agents/prompts/money-agent.ts src/lib/agents/schemas/money-agent-response.ts
git commit -m "feat(agents): money_agent parser (Llama 3.1 70B) with currency + category injection"
```

---

## Task 18: Adversarial fixture set + money_agent tests

**Files:**
- Create: `tests/fixtures/money-agent-cases.ts`
- Create: `tests/agents/money-agent.test.ts`

- [ ] **Step 1: Fixture set (50+ cases across 7 buckets)**

Create `tests/fixtures/money-agent-cases.ts`:

```typescript
import type { MoneyAgentResponse } from '@/lib/agents/schemas/money-agent-response'

export type Case = {
  id: string
  text: string
  bucket: 'happy' | 'currency' | 'amount' | 'direction' | 'date' | 'category' | 'failure'
  // Either an exact expected response, OR field-level predicates the agent must satisfy
  expect: Partial<MoneyAgentResponse>
  // Optional: any field where we'll assert NULL rather than a specific value
  expectNull?: Array<keyof MoneyAgentResponse>
}

export const TEST_CATEGORIES = [
  { name: 'Food', kind: 'spend' as const },
  { name: 'Transport', kind: 'spend' as const },
  { name: 'Rent', kind: 'spend' as const },
  { name: 'Bills', kind: 'spend' as const },
  { name: 'Entertainment', kind: 'spend' as const },
  { name: 'Health', kind: 'spend' as const },
  { name: 'Shopping', kind: 'spend' as const },
  { name: 'Personal', kind: 'spend' as const },
  { name: 'Misc', kind: 'spend' as const },
  { name: 'Salary', kind: 'income' as const },
  { name: 'Freelance', kind: 'income' as const },
  { name: 'Refund', kind: 'income' as const },
  { name: 'Investment', kind: 'income' as const },
  { name: 'Gift', kind: 'income' as const },
]

export const CASES: Case[] = [
  // ----- happy path (10) -----
  { id: 'h-01', bucket: 'happy', text: 'spent 80 on chai',
    expect: { amount: 8000, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'h-02', bucket: 'happy', text: 'paid 250 for lunch',
    expect: { amount: 25000, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'h-03', bucket: 'happy', text: 'got salary 85000',
    expect: { amount: 8500000, currency: 'INR', direction: 'in', category_name: 'Salary' } },
  { id: 'h-04', bucket: 'happy', text: 'bought a book 350',
    expect: { amount: 35000, currency: 'INR', direction: 'out', category_name: 'Shopping' } },
  { id: 'h-05', bucket: 'happy', text: 'metro ride 30 rupees',
    expect: { amount: 3000, currency: 'INR', direction: 'out', category_name: 'Transport' } },
  { id: 'h-06', bucket: 'happy', text: 'paid electricity bill 1200',
    expect: { amount: 120000, currency: 'INR', direction: 'out', category_name: 'Bills' } },
  { id: 'h-07', bucket: 'happy', text: 'netflix 199',
    expect: { amount: 19900, currency: 'INR', direction: 'out', category_name: 'Entertainment' } },
  { id: 'h-08', bucket: 'happy', text: 'freelance project paid 25000',
    expect: { amount: 2500000, currency: 'INR', direction: 'in', category_name: 'Freelance' } },
  { id: 'h-09', bucket: 'happy', text: 'pharmacy 450',
    expect: { amount: 45000, currency: 'INR', direction: 'out', category_name: 'Health' } },
  { id: 'h-10', bucket: 'happy', text: 'birthday gift from mom 1000',
    expect: { amount: 100000, currency: 'INR', direction: 'in', category_name: 'Gift' } },

  // ----- currency parsing (8) -----
  { id: 'c-01', bucket: 'currency', text: '5 dollars coffee',
    expect: { amount: 500, currency: 'USD', direction: 'out' } },
  { id: 'c-02', bucket: 'currency', text: '$12.50 for lunch',
    expect: { amount: 1250, currency: 'USD', direction: 'out' } },
  { id: 'c-03', bucket: 'currency', text: '€20 train ticket',
    expect: { amount: 2000, currency: 'EUR', direction: 'out', category_name: 'Transport' } },
  { id: 'c-04', bucket: 'currency', text: 'paid 150 dirhams at the cafe',
    expect: { amount: 15000, currency: 'AED', direction: 'out', category_name: 'Food' } },
  { id: 'c-05', bucket: 'currency', text: '1500 yen ramen',
    expect: { amount: 1500, currency: 'JPY', direction: 'out', category_name: 'Food' } },
  { id: 'c-06', bucket: 'currency', text: '20 quid dinner',
    expect: { amount: 2000, currency: 'GBP', direction: 'out', category_name: 'Food' } },
  { id: 'c-07', bucket: 'currency', text: '₹500 movie',
    expect: { amount: 50000, currency: 'INR', direction: 'out', category_name: 'Entertainment' } },
  { id: 'c-08', bucket: 'currency', text: '40 SGD shopping at orchard',
    expect: { amount: 4000, currency: 'SGD', direction: 'out', category_name: 'Shopping' } },

  // ----- amount edge cases (8) -----
  { id: 'a-01', bucket: 'amount', text: '80.50 for masala chai',
    expect: { amount: 8050, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'a-02', bucket: 'amount', text: 'paid 1 lakh down payment',
    expect: { amount: 10000000, currency: 'INR', direction: 'out' } },
  { id: 'a-03', bucket: 'amount', text: 'got 1.5 crore from investor',
    expect: { amount: 15000000000, currency: 'INR', direction: 'in' } },
  { id: 'a-04', bucket: 'amount', text: 'spent 5k on shoes',
    expect: { amount: 500000, currency: 'INR', direction: 'out', category_name: 'Shopping' } },
  { id: 'a-05', bucket: 'amount', text: 'paid 25k rent',
    expect: { amount: 2500000, currency: 'INR', direction: 'out', category_name: 'Rent' } },
  { id: 'a-06', bucket: 'amount', text: 'spent 80',
    expect: { amount: 8000, currency: 'INR', direction: 'out' } },
  { id: 'a-07', bucket: 'amount', text: 'bought a book',                       // no amount
    expect: { amount: 0, currency: 'INR', direction: 'out' } },
  { id: 'a-08', bucket: 'amount', text: 'lunch around 200 to 300',             // range — pick midpoint or lower
    expect: { currency: 'INR', direction: 'out', category_name: 'Food' } },    // amount left flexible

  // ----- direction ambiguity (6) -----
  { id: 'd-01', bucket: 'direction', text: 'lent friend 500',
    expect: { amount: 50000, currency: 'INR', direction: 'out' } },
  { id: 'd-02', bucket: 'direction', text: 'friend paid me back 500',
    expect: { amount: 50000, currency: 'INR', direction: 'in' } },
  { id: 'd-03', bucket: 'direction', text: 'refund 1200 from amazon',
    expect: { amount: 120000, currency: 'INR', direction: 'in', category_name: 'Refund' } },
  { id: 'd-04', bucket: 'direction', text: 'I owe 800 to ravi',
    expect: { amount: 80000, currency: 'INR', direction: 'out' } },
  { id: 'd-05', bucket: 'direction', text: 'credit card cashback 250',
    expect: { amount: 25000, currency: 'INR', direction: 'in' } },
  { id: 'd-06', bucket: 'direction', text: 'paid the maid 3000',
    expect: { amount: 300000, currency: 'INR', direction: 'out' } },

  // ----- date parsing (5) — assert occurred_at is NOT the literal "now" placeholder -----
  { id: 't-01', bucket: 'date', text: 'spent 80 on chai yesterday',
    expect: { amount: 8000, direction: 'out' } /* test asserts occurred_at < now */ },
  { id: 't-02', bucket: 'date', text: 'got salary 85000 last week',
    expect: { amount: 8500000, direction: 'in' } },
  { id: 't-03', bucket: 'date', text: 'bought milk this morning 60',
    expect: { amount: 6000, direction: 'out' } },
  { id: 't-04', bucket: 'date', text: 'last Tuesday paid 220 for uber',
    expect: { amount: 22000, direction: 'out' } },
  { id: 't-05', bucket: 'date', text: 'an hour ago spent 90 on samosa',
    expect: { amount: 9000, direction: 'out', category_name: 'Food' } },

  // ----- category inference (8) -----
  { id: 'k-01', bucket: 'category', text: 'samosa 30',
    expect: { amount: 3000, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'k-02', bucket: 'category', text: 'ola airport 600',
    expect: { amount: 60000, direction: 'out', category_name: 'Transport' } },
  { id: 'k-03', bucket: 'category', text: 'spotify 119 monthly',
    expect: { amount: 11900, direction: 'out', category_name: 'Entertainment' } },
  { id: 'k-04', bucket: 'category', text: 'apollo pharmacy 750',
    expect: { amount: 75000, direction: 'out', category_name: 'Health' } },
  { id: 'k-05', bucket: 'category', text: 'flipkart shoes 2400',
    expect: { amount: 240000, direction: 'out', category_name: 'Shopping' } },
  { id: 'k-06', bucket: 'category', text: 'petrol 1500',
    expect: { amount: 150000, direction: 'out', category_name: 'Transport' } },
  { id: 'k-07', bucket: 'category', text: 'TCS deposit 92000',
    expect: { amount: 9200000, direction: 'in', category_name: 'Salary' } },
  { id: 'k-08', bucket: 'category', text: 'haircut 350',
    expect: { amount: 35000, direction: 'out', category_name: 'Personal' } },

  // ----- failure modes (5) -----
  { id: 'f-01', bucket: 'failure', text: '',                                   // empty input
    expect: { amount: 0, direction: 'out' } },
  { id: 'f-02', bucket: 'failure', text: 'asdfgh qwerty',                      // gibberish
    expect: { amount: 0, direction: 'out' } },
  { id: 'f-03', bucket: 'failure', text: '500',                                // amount only, no context
    expect: { amount: 50000, currency: 'INR' } },
  { id: 'f-04', bucket: 'failure', text: 'food',                               // category only
    expect: { amount: 0, category_name: 'Food' } },
  { id: 'f-05', bucket: 'failure', text: 'hi there',                           // greeting (Router catches this; tested for robustness)
    expect: { amount: 0 } },
]
```

- [ ] **Step 2: Test runner against mocked Groq**

Create `tests/agents/money-agent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { parseMoneyEntry } from '@/lib/agents/money-agent'
import { CASES, TEST_CATEGORIES, type Case } from '../fixtures/money-agent-cases'

function makeMockResponseForCase(c: Case) {
  // Build a mock response that satisfies the case's `expect` block.
  // This validates the AGENT'S OWN PARSING / VALIDATION pipeline:
  // - The Groq SDK is mocked
  // - The JSON we return matches what a well-behaved 70B would produce
  // - parseMoneyEntry should pass it through Zod and return the same shape
  const base = {
    amount: 0, currency: 'INR' as const, direction: 'out' as const,
    category_name: null, description: null,
    occurred_at: new Date().toISOString(),
  }
  return { ...base, ...c.expect }
}

function mockGroqWith(json: object) {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }) } },
  }
}

describe('parseMoneyEntry — fixture validation (mocked Groq)', () => {
  for (const c of CASES) {
    it(`${c.id} (${c.bucket}): "${c.text}"`, async () => {
      const fake = makeMockResponseForCase(c)
      const client = mockGroqWith(fake)
      const out = await parseMoneyEntry({
        client: client as never,
        text: c.text,
        categories: TEST_CATEGORIES,
        nowIso: '2026-06-18T14:30:00.000Z',
      })

      for (const [k, v] of Object.entries(c.expect)) {
        // @ts-expect-error indexed
        expect(out[k]).toEqual(v)
      }
    })
  }
})
```

- [ ] **Step 3: Run tests**

```powershell
pnpm test -- tests/agents/money-agent.test.ts
```

Expected: 50 tests pass. (This validates the Zod schema + the agent wrapper. It does NOT validate the actual 70B prompt — that's `scripts/eval-agents.ts` in Task 28.)

- [ ] **Step 4: Commit**

```powershell
git add tests/fixtures/money-agent-cases.ts tests/agents/money-agent.test.ts
git commit -m "test(agents): 50-case adversarial fixture set + money_agent runner"
```

---

## Task 19: /api/voice route + wire /api/agent to real agents

**Files:**
- Create: `src/app/api/voice/route.ts`
- Modify: `src/app/api/agent/route.ts` (replace the stub with real agent calls)
- Create: `tests/api/voice-route.test.ts`

- [ ] **Step 1: Replace /api/agent stub with real agent dispatch**

Replace `src/app/api/agent/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getSession } from '@/lib/auth'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { routeIntent } from '@/lib/agents/router'
import { parseMoneyEntry } from '@/lib/agents/money-agent'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  text: z.string().min(1).max(500),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['spend', 'income']),
  })).default([]),
})

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getCloudflareContext()
  const apiKey = (env as { GROQ_API_KEY?: string }).GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'groq_not_configured' }, { status: 500 })
  const groq = makeGroqClient(apiKey)

  try {
    const router = await routeIntent({ client: groq, text: parsed.data.text })

    if (router.intent !== 'log_money') {
      return NextResponse.json({
        transcript: parsed.data.text,
        intent: router.intent,
        confidence: router.confidence,
        payload: null,
      })
    }

    const payload = await parseMoneyEntry({
      client: groq,
      text: parsed.data.text,
      categories: parsed.data.categories.map(c => ({ name: c.name, kind: c.kind })),
    })

    // Resolve category_name → category_id by matching against the active list
    const matchedCat = parsed.data.categories.find(
      c => c.name === payload.category_name && c.kind === (payload.direction === 'out' ? 'spend' : 'income'),
    )

    return NextResponse.json({
      transcript: parsed.data.text,
      intent: 'log_money',
      confidence: router.confidence,
      payload: {
        amount: payload.amount,
        currency: payload.currency,
        direction: payload.direction,
        category_id: matchedCat?.id ?? null,
        description: payload.description,
        occurred_at: payload.occurred_at,
        source: 'manual',
        raw_input: parsed.data.text,
      },
    })
  } catch (err) {
    console.error('/api/agent', err)
    return NextResponse.json({
      transcript: parsed.data.text,
      intent: 'log_money',
      confidence: 0,
      payload: null,
      error: (err as Error).message,
    }, { status: 502 })
  }
}
```

- [ ] **Step 2: Implement /api/voice (multipart audio → JSON)**

Create `src/app/api/voice/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { groqWhisper } from '@/lib/agents/whisper'
import { routeIntent } from '@/lib/agents/router'
import { parseMoneyEntry } from '@/lib/agents/money-agent'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })

  const audio = formData.get('audio')
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'audio blob missing' }, { status: 400 })

  const { env } = getCloudflareContext()
  const apiKey = (env as { GROQ_API_KEY?: string }).GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'groq_not_configured' }, { status: 500 })
  const groq = makeGroqClient(apiKey)

  // Fetch user's active categories so the agent can pick from them
  const d1 = (env as { DB: D1Database }).DB
  const db = createDb(d1)
  const cats = await db
    .selectFrom('categories')
    .where('user_id', '=', userId)
    .where('is_archived', '=', 0)
    .where('deleted_at', 'is', null)
    .select(['id', 'name', 'kind'])
    .execute()

  let transcript = ''
  try {
    const w = await groqWhisper({ client: groq, blob: audio, filename: 'voice.webm' })
    transcript = w.transcript
  } catch (err) {
    return NextResponse.json({
      transcript: '', intent: null, confidence: 0, payload: null,
      error: `whisper: ${(err as Error).message}`,
    }, { status: 502 })
  }

  try {
    const router = await routeIntent({ client: groq, text: transcript })
    if (router.intent !== 'log_money') {
      return NextResponse.json({ transcript, intent: router.intent, confidence: router.confidence, payload: null })
    }

    const payload = await parseMoneyEntry({
      client: groq,
      text: transcript,
      categories: cats.map(c => ({ name: c.name, kind: c.kind as 'spend' | 'income' })),
    })

    const matchedCat = cats.find(
      c => c.name === payload.category_name && c.kind === (payload.direction === 'out' ? 'spend' : 'income'),
    )

    return NextResponse.json({
      transcript,
      intent: 'log_money',
      confidence: router.confidence,
      payload: {
        amount: payload.amount,
        currency: payload.currency,
        direction: payload.direction,
        category_id: matchedCat?.id ?? null,
        description: payload.description,
        occurred_at: payload.occurred_at,
        source: 'voice',
        raw_input: transcript,
      },
    })
  } catch (err) {
    return NextResponse.json({
      transcript, intent: null, confidence: 0, payload: null,
      error: (err as Error).message,
    }, { status: 502 })
  }
}
```

- [ ] **Step 3: Test for /api/voice (mocked Groq + DB)**

Create `tests/api/voice-route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/voice/route'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const fakeDb = {
  selectFrom: () => ({ where: () => ({ where: () => ({ where: () => ({ select: () => ({ execute: async () => [
    { id: 'cat-food', name: 'Food', kind: 'spend' },
  ] }) }) }) }) }),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { GROQ_API_KEY: 'k', DB: null } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

vi.mock('@/lib/agents/whisper', () => ({
  groqWhisper: vi.fn().mockResolvedValue({ transcript: 'spent 80 on chai', duration_ms: 1800 }),
}))
vi.mock('@/lib/agents/router', () => ({
  routeIntent: vi.fn().mockResolvedValue({ intent: 'log_money', confidence: 0.95 }),
}))
vi.mock('@/lib/agents/money-agent', () => ({
  parseMoneyEntry: vi.fn().mockResolvedValue({
    amount: 8000, currency: 'INR', direction: 'out',
    category_name: 'Food', description: 'chai',
    occurred_at: '2026-06-18T14:30:00.000Z',
  }),
}))

describe('/api/voice', () => {
  function makeMultipartReq(blob: Blob): Request {
    const fd = new FormData()
    fd.append('audio', blob, 'voice.webm')
    return new Request('http://x/api/voice', { method: 'POST', body: fd })
  }

  it('round-trips audio → transcript → payload with category_id resolved', async () => {
    const res = await POST(makeMultipartReq(new Blob(['fake'], { type: 'audio/webm' })))
    expect(res.status).toBe(200)
    const body = await res.json() as { transcript: string; payload: { amount: number; category_id: string } }
    expect(body.transcript).toBe('spent 80 on chai')
    expect(body.payload.amount).toBe(8000)
    expect(body.payload.category_id).toBe('cat-food')
  })

  it('returns 401 without a session', async () => {
    const { getSession } = await import('@/lib/auth')
    ;(getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST(makeMultipartReq(new Blob(['fake'])))
    expect(res.status).toBe(401)
  })

  it('returns 400 when audio blob is missing', async () => {
    const fd = new FormData()
    const res = await POST(new Request('http://x/api/voice', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 4: Run tests**

```powershell
pnpm test -- tests/api/voice-route.test.ts tests/api/agent-route.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/voice/route.ts src/app/api/agent/route.ts tests/api/voice-route.test.ts
git commit -m "feat(api): /api/voice + wire /api/agent to real Router + money_agent"
```

---

## Task 20: VoiceRecorder component + voice queue drain

**Files:**
- Create: `src/lib/voice-queue.ts`
- Create: `src/components/voice-recorder.tsx`
- Create: `tests/voice-queue.test.ts`
- Modify: `src/app/app/page.tsx` (slot in <VoiceRecorder/>)

- [ ] **Step 1: Voice-queue tests**

Create `tests/voice-queue.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { enqueueVoice, drainVoiceQueue } from '@/lib/voice-queue'

describe('voice-queue', () => {
  beforeEach(async () => { await resetDb() })

  it('enqueue persists a blob with status=queued', async () => {
    await enqueueVoice(new Blob(['x'], { type: 'audio/webm' }))
    const items = await db.voice_queue.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('queued')
  })

  it('drain calls the processor and marks done on success', async () => {
    await enqueueVoice(new Blob(['x']))
    const proc = vi.fn().mockResolvedValue({ ok: true })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    const items = await db.voice_queue.toArray()
    expect(items[0].status).toBe('done')
    expect(proc).toHaveBeenCalledTimes(1)
  })

  it('drain increments retry_count on failure and stops after maxRetries', async () => {
    await enqueueVoice(new Blob(['x']))
    const proc = vi.fn().mockRejectedValue(new Error('boom'))
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })   // fourth call should NOT process
    expect(proc).toHaveBeenCalledTimes(3)
    const item = (await db.voice_queue.toArray())[0]
    expect(item.status).toBe('failed')
    expect(item.retry_count).toBe(3)
  })

  it('drain processes only queued items (skips done/failed)', async () => {
    await enqueueVoice(new Blob(['a']))
    await enqueueVoice(new Blob(['b']))
    const proc = vi.fn().mockResolvedValue({ ok: true })
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })
    expect(proc).toHaveBeenCalledTimes(2)
    await drainVoiceQueue({ processBlob: proc, maxRetries: 3 })   // nothing left
    expect(proc).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Implement voice-queue**

Create `src/lib/voice-queue.ts`:

```typescript
import { db } from '@/lib/dexie'

export async function enqueueVoice(blob: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await db.voice_queue.put({
    id, blob,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'queued',
  })
  return id
}

type DrainArgs = {
  processBlob: (blob: Blob) => Promise<{ ok: boolean }>
  maxRetries: number
}

export async function drainVoiceQueue({ processBlob, maxRetries }: DrainArgs): Promise<void> {
  const items = await db.voice_queue.where('status').equals('queued').toArray()
  for (const item of items) {
    await db.voice_queue.update(item.id, { status: 'transcribing' })
    try {
      await processBlob(item.blob)
      await db.voice_queue.update(item.id, { status: 'done' })
    } catch (err) {
      const nextCount = item.retry_count + 1
      const failed = nextCount >= maxRetries
      await db.voice_queue.update(item.id, {
        status: failed ? 'failed' : 'queued',
        retry_count: nextCount,
      })
      console.warn('voice-queue: process failed', err)
    }
  }
}
```

- [ ] **Step 3: Run voice-queue tests**

```powershell
pnpm test -- tests/voice-queue.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: VoiceRecorder component**

Create `src/components/voice-recorder.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { enqueueVoice } from '@/lib/voice-queue'

type Props = {
  onParsed: (payload: unknown, transcript: string) => void
  disabled?: boolean
}

type RecState = 'idle' | 'recording' | 'uploading' | 'error'

export function VoiceRecorder({ onParsed, disabled }: Props) {
  const [state, setState] = useState<RecState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const streamRef   = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime })
        await processBlob(blob)
      }
      recorder.start()
      recorderRef.current = recorder
      setState('recording')
    } catch (err) {
      setError((err as Error).message || 'mic permission denied')
      setState('error')
    }
  }

  function stop() {
    const r = recorderRef.current
    if (!r || r.state === 'inactive') return
    setState('uploading')
    r.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function processBlob(blob: Blob) {
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'voice.webm')
      const res = await fetch('/api/voice', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`voice ${res.status}`)
      const data = await res.json() as { payload: unknown; transcript: string }
      onParsed(data.payload, data.transcript)
      setState('idle')
    } catch (err) {
      console.warn('voice upload failed — queuing', err)
      await enqueueVoice(blob)
      setError('Queued — will retry when online')
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled || state === 'uploading'}
        onClick={state === 'recording' ? stop : start}
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-2xl transition ${
          state === 'recording'
            ? 'border-rose-500 bg-rose-500/20 text-rose-600 animate-pulse'
            : 'border-foreground bg-background hover:bg-accent'
        }`}
        aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
      >
        {state === 'uploading' ? '…' : '🎙️'}
      </button>
      <p className="text-xs text-muted-foreground">
        {state === 'idle'       && 'tap to record'}
        {state === 'recording'  && 'tap again to stop'}
        {state === 'uploading'  && 'transcribing…'}
        {state === 'error'      && (error ?? 'error')}
      </p>
      {error && state === 'idle' && (
        <p className="text-[10px] text-muted-foreground">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire VoiceRecorder + queue drain into /app**

Edit `src/app/app/page.tsx` — replace the "Voice input lands in Phase 1.3" placeholder block with:

```typescript
import { VoiceRecorder } from '@/components/voice-recorder'
import { drainVoiceQueue } from '@/lib/voice-queue'
```

```typescript
// inside AppPage component, after the existing sync interval useEffect, add:
useEffect(() => {
  if (!user) return
  const onOnline = () => {
    drainVoiceQueue({
      processBlob: async (blob) => {
        const fd = new FormData()
        fd.append('audio', blob, 'voice.webm')
        const res = await fetch('/api/voice', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(`voice ${res.status}`)
        return { ok: true }
      },
      maxRetries: 3,
    }).catch(err => console.error('drain', err))
  }
  window.addEventListener('online', onOnline)
  onOnline()                          // also drain on app open
  return () => window.removeEventListener('online', onOnline)
}, [user])
```

Replace the placeholder div with:

```typescript
<div className="flex justify-center py-2">
  <VoiceRecorder
    disabled={draft !== null || parsing}
    onParsed={(payload, transcript) => {
      if (!payload) {
        setDraft({
          amount: 0, currency: 'INR', direction: 'out',
          occurred_at: new Date().toISOString(),
          source: 'voice', raw_input: transcript,
        })
      } else {
        setDraft(payload as ChipDraft)
      }
    }}
  />
</div>
```

- [ ] **Step 6: Typecheck + tests**

```powershell
pnpm typecheck
pnpm test
```

Expected: green.

- [ ] **Step 7: Manual E2E smoke**

```powershell
pnpm dev
```

Open in a mobile browser (mic permission required — Chrome / Safari iOS):
1. `/login` → sign in
2. `/app` → tap mic
3. Say "spent 80 on chai" → tap mic again to stop
4. Chip appears with `₹80`, category=Food, description=chai
5. Tap Confirm
6. Entry appears in list; verify it sync'd to desktop

- [ ] **Step 8: Commit**

```powershell
git add src/lib/voice-queue.ts src/components/voice-recorder.tsx src/app/app/page.tsx tests/voice-queue.test.ts
git commit -m "feat(voice): VoiceRecorder component + offline queue drain"
```

---

**Sub-phase 1.3 done.** Voice round-trip works phone↔desktop in <5s. Offline queue picks up dropped uploads on reconnect. Median latency target met. Next: recurring engine.

---

# Phase 1.4 — Recurring engine

## Task 21: computeNextDue + recurring helpers

**Files:**
- Create: `src/lib/recurring.ts`
- Create: `tests/recurring.test.ts`

- [ ] **Step 1: Write the unit tests (20+ cases)**

Create `tests/recurring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeNextDue, checkEndConditions, type RecurringRule } from '@/lib/recurring'

function mk(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: 'r1',
    period: 'monthly',
    interval_count: 1,
    anchor_at: '2026-01-01T00:00:00.000Z',
    next_due_at: '2026-01-01T00:00:00.000Z',
    occurrences_so_far: 0,
    end_condition_kind: 'never',
    end_until: null,
    end_count: null,
    is_active: 1,
    ...overrides,
  }
}

describe('computeNextDue — daily', () => {
  it('advances by 1 day', () => {
    expect(computeNextDue(mk({ period: 'daily', next_due_at: '2026-06-10T00:00:00.000Z' })))
      .toBe('2026-06-11T00:00:00.000Z')
  })
  it('advances by N days for interval_count=N', () => {
    expect(computeNextDue(mk({ period: 'daily', interval_count: 3, next_due_at: '2026-06-10T00:00:00.000Z' })))
      .toBe('2026-06-13T00:00:00.000Z')
  })
})

describe('computeNextDue — weekly', () => {
  it('advances by 7 days', () => {
    expect(computeNextDue(mk({ period: 'weekly', next_due_at: '2026-06-10T00:00:00.000Z' })))
      .toBe('2026-06-17T00:00:00.000Z')
  })
  it('preserves day-of-week across the month boundary', () => {
    expect(computeNextDue(mk({ period: 'weekly', next_due_at: '2026-06-26T00:00:00.000Z' })))
      .toBe('2026-07-03T00:00:00.000Z')
  })
})

describe('computeNextDue — monthly', () => {
  it('advances by one month', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-06-15T00:00:00.000Z' })))
      .toBe('2026-07-15T00:00:00.000Z')
  })
  it('clamps Jan 31 → Feb 28 (non-leap)', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-01-31T00:00:00.000Z' })))
      .toBe('2026-02-28T00:00:00.000Z')
  })
  it('clamps Jan 31 → Feb 29 in a leap year (2024)', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2024-01-31T00:00:00.000Z' })))
      .toBe('2024-02-29T00:00:00.000Z')
  })
  it('Feb 28 → Mar 28 (does NOT re-extend to 31)', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-02-28T00:00:00.000Z' })))
      .toBe('2026-03-28T00:00:00.000Z')
  })
  it('preserves day-of-month using anchor: Jan 31 → Feb 28 → Mar 31', () => {
    // anchor=31 should give us the original day back on long months
    const r = mk({ period: 'monthly', anchor_at: '2026-01-31T00:00:00.000Z', next_due_at: '2026-02-28T00:00:00.000Z' })
    expect(computeNextDue(r)).toBe('2026-03-31T00:00:00.000Z')
  })
  it('advances by N months for interval_count=N', () => {
    expect(computeNextDue(mk({ period: 'monthly', interval_count: 3, next_due_at: '2026-01-15T00:00:00.000Z' })))
      .toBe('2026-04-15T00:00:00.000Z')
  })
})

describe('computeNextDue — yearly', () => {
  it('advances by one year', () => {
    expect(computeNextDue(mk({ period: 'yearly', next_due_at: '2026-06-15T00:00:00.000Z' })))
      .toBe('2027-06-15T00:00:00.000Z')
  })
  it('Feb 29 in a leap year → Feb 28 in a non-leap year', () => {
    expect(computeNextDue(mk({ period: 'yearly', next_due_at: '2024-02-29T00:00:00.000Z' })))
      .toBe('2025-02-28T00:00:00.000Z')
  })
  it('uses anchor=Feb 29 → 2025 → 2026 → 2028 (long path)', () => {
    const r = mk({ period: 'yearly', anchor_at: '2024-02-29T00:00:00.000Z', next_due_at: '2025-02-28T00:00:00.000Z' })
    expect(computeNextDue(r)).toBe('2026-02-28T00:00:00.000Z')
  })
})

describe('computeNextDue — time-of-day preservation', () => {
  it('preserves UTC time-of-day on monthly advance', () => {
    expect(computeNextDue(mk({ period: 'monthly', next_due_at: '2026-06-15T09:30:00.000Z' })))
      .toBe('2026-07-15T09:30:00.000Z')
  })
})

describe('checkEndConditions', () => {
  it('never-ending rules stay active', () => {
    expect(checkEndConditions(mk({ end_condition_kind: 'never', occurrences_so_far: 999 })))
      .toEqual({ is_active: 1 })
  })

  it('until: deactivates once next_due_at passes end_until', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'until',
      end_until: '2026-12-31T23:59:59.000Z',
      next_due_at: '2027-01-01T00:00:00.000Z',
    }))).toEqual({ is_active: 0 })
  })

  it('until: stays active when next_due_at is before end_until', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'until',
      end_until: '2026-12-31T23:59:59.000Z',
      next_due_at: '2026-06-15T00:00:00.000Z',
    }))).toEqual({ is_active: 1 })
  })

  it('count: deactivates after end_count occurrences', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'count', end_count: 12, occurrences_so_far: 12,
    }))).toEqual({ is_active: 0 })
  })

  it('count: stays active when occurrences_so_far < end_count', () => {
    expect(checkEndConditions(mk({
      end_condition_kind: 'count', end_count: 12, occurrences_so_far: 5,
    }))).toEqual({ is_active: 1 })
  })
})

describe('property: monotonic advance', () => {
  it('next_due_at > current_due_at for any non-degenerate rule', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('daily', 'weekly', 'monthly', 'yearly'),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2028, 11, 31) }),
        (period, interval, ms) => {
          const r = mk({
            period: period as RecurringRule['period'],
            interval_count: interval,
            anchor_at: new Date(ms).toISOString(),
            next_due_at: new Date(ms).toISOString(),
          })
          const next = computeNextDue(r)
          expect(next > r.next_due_at).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})
```

- [ ] **Step 2: Run — verify failure**

```powershell
pnpm test -- tests/recurring.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `src/lib/recurring.ts`:

```typescript
import { addDays, addWeeks, addMonths, addYears, getDate, isLeapYear, lastDayOfMonth, setDate } from 'date-fns'

export type RecurringRule = {
  id: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  anchor_at: string                    // ISO
  next_due_at: string                  // ISO
  occurrences_so_far: number
  end_condition_kind: 'never' | 'until' | 'count'
  end_until: string | null
  end_count: number | null
  is_active: number
}

// Compute the NEXT ISO timestamp after rule.next_due_at, respecting period + interval.
//
// For monthly/yearly we re-anchor day-of-month from `anchor_at` so that a rule with
// anchor=Jan 31 produces 31 → 28(or 29) → 31 → 30 → 31 across the year, rather than
// permanently collapsing to 28 after the first Feb hop.
export function computeNextDue(rule: RecurringRule): string {
  const cur = new Date(rule.next_due_at)
  const interval = rule.interval_count

  switch (rule.period) {
    case 'daily':
      return addDays(cur, interval).toISOString()

    case 'weekly':
      return addWeeks(cur, interval).toISOString()

    case 'monthly': {
      const advanced = addMonths(cur, interval)
      return clampToAnchorDay(advanced, rule.anchor_at).toISOString()
    }

    case 'yearly': {
      const advanced = addYears(cur, interval)
      return clampToAnchorDay(advanced, rule.anchor_at, /*alsoMonth=*/true).toISOString()
    }
  }
}

function clampToAnchorDay(advanced: Date, anchorIso: string, alsoMonth = false): Date {
  const anchor = new Date(anchorIso)
  const anchorDom = getDate(anchor)
  const anchorMonth = anchor.getUTCMonth()

  let working = advanced
  if (alsoMonth) {
    // For yearly: anchor's month is fixed; we just need to clamp DOM (handles Feb 29 → Feb 28)
    working = new Date(Date.UTC(
      working.getUTCFullYear(),
      anchorMonth,
      Math.min(anchorDom, lastDayOfMonth(new Date(Date.UTC(working.getUTCFullYear(), anchorMonth, 1))).getUTCDate()),
      anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds(),
    ))
    return working
  }

  // monthly: keep the advanced month/year, but reset DOM to min(anchorDom, last-day-of-target-month)
  const targetMonthLastDay = lastDayOfMonth(new Date(Date.UTC(working.getUTCFullYear(), working.getUTCMonth(), 1))).getUTCDate()
  const dom = Math.min(anchorDom, targetMonthLastDay)
  return new Date(Date.UTC(
    working.getUTCFullYear(),
    working.getUTCMonth(),
    dom,
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds(),
  ))
}

export function checkEndConditions(rule: RecurringRule): { is_active: number } {
  if (rule.end_condition_kind === 'never') return { is_active: 1 }
  if (rule.end_condition_kind === 'until') {
    if (!rule.end_until) return { is_active: 1 }
    return { is_active: rule.next_due_at > rule.end_until ? 0 : 1 }
  }
  if (rule.end_condition_kind === 'count') {
    if (rule.end_count == null) return { is_active: 1 }
    return { is_active: rule.occurrences_so_far >= rule.end_count ? 0 : 1 }
  }
  return { is_active: 1 }
}
```

- [ ] **Step 4: Run tests**

```powershell
pnpm test -- tests/recurring.test.ts
```

Expected: all 20 tests + 1 property test pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/recurring.ts tests/recurring.test.ts
git commit -m "feat(recurring): computeNextDue + checkEndConditions with anchor-DOM clamping"
```

---

## Task 22: Hook "Make recurring" toggle in ConfirmationChip + period picker

**Files:**
- Create: `src/components/period-picker.tsx`
- Modify: `src/components/confirmation-chip.tsx`
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Period picker component**

Create `src/components/period-picker.tsx`:

```typescript
'use client'

import { cn } from '@/lib/utils'

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

type Props = {
  period: Period
  intervalCount: number
  onChange: (period: Period, intervalCount: number) => void
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
]

export function PeriodPicker({ period, intervalCount, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-2">
      <div className="flex gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value, intervalCount)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-xs',
              p.value === period ? 'bg-foreground text-background' : 'hover:bg-accent',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between text-xs">
        <span>every</span>
        <input
          type="number"
          min={1}
          max={365}
          value={intervalCount}
          onChange={e => onChange(period, Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-16 rounded-md border bg-background px-2 py-0.5 text-right"
        />
        <span className="text-muted-foreground">{period === 'daily' ? 'day(s)' : period === 'weekly' ? 'week(s)' : period === 'monthly' ? 'month(s)' : 'year(s)'}</span>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Extend ConfirmationChip with period picker when recurring toggled on**

Edit `src/components/confirmation-chip.tsx` — add new state and slot below the toggle:

```typescript
import { PeriodPicker, type Period } from '@/components/period-picker'
// ...
const [period, setPeriod] = useState<Period>('monthly')
const [intervalCount, setIntervalCount] = useState(1)
```

Replace the existing `<label>…</label>` recurring-toggle block with:

```typescript
<div className="mb-3 flex flex-col gap-2">
  <label className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
    <span>Make recurring</span>
    <input
      type="checkbox"
      checked={makeRecurring}
      onChange={e => setMakeRecurring(e.currentTarget.checked)}
    />
  </label>
  {makeRecurring && (
    <PeriodPicker
      period={period}
      intervalCount={intervalCount}
      onChange={(p, n) => { setPeriod(p); setIntervalCount(n) }}
    />
  )}
</div>
```

Update the `onConfirm` signature in the Props type to receive period info too:

```typescript
type Props = {
  userId: string
  draft: ChipDraft
  categoryById: Map<string, CategoryRow>
  onConfirm: (final: ChipDraft, recurring: { enabled: boolean; period: Period; intervalCount: number }) => Promise<void>
  onCancel: () => void
}
```

And replace the `handleConfirm` call:

```typescript
async function handleConfirm() {
  setBusy(true)
  try { await onConfirm(d, { enabled: makeRecurring, period, intervalCount }) }
  finally { setBusy(false) }
}
```

- [ ] **Step 3: Wire the recurring rule creation in /app**

Edit `src/app/app/page.tsx` — update the `confirmEntry` function:

```typescript
async function confirmEntry(
  final: ChipDraft,
  recurring: { enabled: boolean; period: 'daily'|'weekly'|'monthly'|'yearly'; intervalCount: number },
) {
  if (!user) return

  let ruleId: string | null = null
  if (recurring.enabled) {
    ruleId = crypto.randomUUID()
    const ruleOp = await generateOp({
      entity_kind: 'recurring',
      entity_id: ruleId,
      op_type: 'create',
      payload: {
        amount: final.amount, currency: final.currency, direction: final.direction,
        category_id: final.category_id ?? null,
        description: final.description ?? null,
        period: recurring.period,
        interval_count: recurring.intervalCount,
        anchor_at: final.occurred_at,
        next_due_at: nextDueFromAnchor(final.occurred_at, recurring.period, recurring.intervalCount),
        end_condition_kind: 'never',
        is_active: 1,
      },
      user_id: user.id,
    })
    await applyLocalOp(ruleOp)
  }

  const entryOp = await generateOp({
    entity_kind: 'money',
    entity_id: crypto.randomUUID(),
    op_type: 'create',
    payload: {
      amount: final.amount, currency: final.currency, direction: final.direction,
      category_id: final.category_id ?? null,
      description: final.description ?? null,
      occurred_at: final.occurred_at,
      source: final.source,
      raw_input: final.raw_input ?? null,
      recurring_rule_id: ruleId,
    },
    user_id: user.id,
  })
  await applyLocalOp(entryOp)
  setDraft(null)
  pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
}

function nextDueFromAnchor(anchorIso: string, period: 'daily'|'weekly'|'monthly'|'yearly', n: number): string {
  // The user has just made this entry — the FIRST occurrence is the entry we're creating right now.
  // next_due_at is therefore "one interval after the anchor."
  const d = new Date(anchorIso)
  if (period === 'daily')   d.setUTCDate(d.getUTCDate() + n)
  if (period === 'weekly')  d.setUTCDate(d.getUTCDate() + 7 * n)
  if (period === 'monthly') d.setUTCMonth(d.getUTCMonth() + n)
  if (period === 'yearly')  d.setUTCFullYear(d.getUTCFullYear() + n)
  return d.toISOString()
}
```

- [ ] **Step 4: Typecheck**

```powershell
pnpm typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```powershell
git add src/components/confirmation-chip.tsx src/components/period-picker.tsx src/app/app/page.tsx
git commit -m "feat(recurring): wire 'Make recurring' toggle to create a recurring_rule + first entry"
```

---

## Task 23: /api/cron/recur route

**Files:**
- Create: `src/app/api/cron/recur/route.ts`
- Create: `tests/api/cron-recur-route.test.ts`

- [ ] **Step 1: Failing tests for the route**

Create `tests/api/cron-recur-route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock the wrangler/CF env + the DB
const dueRules = [
  {
    id: 'rule-1', user_id: 'u1',
    amount: 2500000, currency: 'INR', direction: 'out',
    category_id: 'cat-rent', description: 'rent',
    period: 'monthly', interval_count: 1,
    anchor_at: '2026-05-01T00:00:00.000Z',
    next_due_at: '2026-06-01T00:00:00.000Z',
    end_condition_kind: 'never', end_until: null, end_count: null,
    occurrences_so_far: 1,
    is_active: 1,
    field_hlcs: '{}',
    deleted_at: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  },
]

const inserts: unknown[] = []
const updates: unknown[] = []
const fakeDb = {
  selectFrom: () => ({
    where: () => ({
      where: () => ({
        where: () => ({
          selectAll: () => ({
            limit: () => ({
              execute: async () => dueRules,
            }),
          }),
        }),
      }),
    }),
  }),
  insertInto: (table: string) => ({
    values: (v: unknown) => ({
      onConflict: () => ({ execute: async () => { inserts.push({ table, v }) } }),
      execute: async () => { inserts.push({ table, v }) },
    }),
  }),
  updateTable: (table: string) => ({
    set: (v: unknown) => ({ where: () => ({ execute: async () => { updates.push({ table, v }) } }) }),
  }),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const { POST } = await import('@/app/api/cron/recur/route')

function cronReq() {
  return new Request('http://x/api/cron/recur', {
    method: 'POST',
    headers: { 'cf-cron': '0 2 * * *' },   // marker the route checks for
  })
}

describe('/api/cron/recur', () => {
  it('rejects requests without a cron marker', async () => {
    const res = await POST(new Request('http://x/api/cron/recur', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('processes a due rule: inserts an op_log row + a money_entries row + updates the rule', async () => {
    inserts.length = 0; updates.length = 0
    const res = await POST(cronReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { processed: number }
    expect(body.processed).toBeGreaterThanOrEqual(1)
    expect(inserts.some(i => (i as { table: string }).table === 'op_log')).toBe(true)
    expect(inserts.some(i => (i as { table: string }).table === 'money_entries')).toBe(true)
    expect(updates.some(u => (u as { table: string }).table === 'recurring_rules')).toBe(true)
  })
})
```

- [ ] **Step 2: Implement the route**

Create `src/app/api/cron/recur/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { computeNextDue, checkEndConditions, type RecurringRule } from '@/lib/recurring'
import { applyOp } from '@/lib/op-log'
import type { Op } from '@/types/ops'

export const dynamic = 'force-dynamic'

const CRON_SAFETY_CAP = 100              // max catch-up entries per rule per run
const RUN_BATCH_SIZE  = 1000             // max rules processed per cron tick

export async function POST(req: Request) {
  if (!isCloudflareCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { env } = getCloudflareContext()
  const d1 = (env as { DB: D1Database }).DB
  const db = createDb(d1)

  const now = new Date().toISOString()
  const dueRules = await db
    .selectFrom('recurring_rules')
    .where('next_due_at', '<=', now)
    .where('is_active', '=', 1)
    .where('deleted_at', 'is', null)
    .selectAll()
    .limit(RUN_BATCH_SIZE)
    .execute()

  let processed = 0
  for (const row of dueRules) {
    let rule = rowToRule(row)
    let safety = CRON_SAFETY_CAP
    while (rule.next_due_at <= new Date().toISOString() && rule.is_active === 1 && safety-- > 0) {
      await emitEntry(db, rule, row.user_id)
      const advanced = computeNextDue(rule)
      const end = checkEndConditions({ ...rule, next_due_at: advanced })
      rule = {
        ...rule,
        next_due_at: advanced,
        occurrences_so_far: rule.occurrences_so_far + 1,
        is_active: end.is_active,
      }
      await db
        .updateTable('recurring_rules')
        .set({
          next_due_at: rule.next_due_at,
          occurrences_so_far: rule.occurrences_so_far,
          is_active: rule.is_active,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', rule.id)
        .execute()
      processed++
    }
  }

  return NextResponse.json({ processed })
}

function isCloudflareCron(req: Request): boolean {
  // CF cron triggers set this header. In dev, allow if the host is localhost AND a
  // local secret matches (skip for now — Phase 1 doesn't expose dev cron endpoint).
  return req.headers.get('cf-cron') !== null || req.headers.get('x-cf-trigger') === 'cron'
}

function rowToRule(row: {
  id: string; period: string; interval_count: number; anchor_at: string; next_due_at: string;
  occurrences_so_far: number; end_condition_kind: string; end_until: string | null; end_count: number | null;
  is_active: number;
}): RecurringRule {
  return {
    id: row.id,
    period: row.period as RecurringRule['period'],
    interval_count: row.interval_count,
    anchor_at: row.anchor_at,
    next_due_at: row.next_due_at,
    occurrences_so_far: row.occurrences_so_far,
    end_condition_kind: row.end_condition_kind as RecurringRule['end_condition_kind'],
    end_until: row.end_until,
    end_count: row.end_count,
    is_active: row.is_active,
  }
}

async function emitEntry(db: ReturnType<typeof createDb>, rule: RecurringRule, userId: string) {
  // Deterministic op id → idempotent even if cron runs twice for the same fire
  const opId = `recur-${rule.id}-${rule.next_due_at}`
  const exists = await db.selectFrom('op_log').where('id', '=', opId).select('id').executeTakeFirst()
  if (exists) return

  // Read template fields from the rule row again (we have rule.id but not amount/currency/etc here)
  const tpl = await db
    .selectFrom('recurring_rules')
    .where('id', '=', rule.id)
    .select(['amount', 'currency', 'direction', 'category_id', 'description'])
    .executeTakeFirst()
  if (!tpl) return

  const entryId = `recur-entry-${rule.id}-${rule.next_due_at}`
  const op: Op = {
    id: opId,
    hlc: serverHlcFor(rule.next_due_at),
    device_id: 'cron',
    user_id: userId,
    entity_kind: 'money',
    entity_id: entryId,
    op_type: 'create',
    payload: {
      amount: tpl.amount,
      currency: tpl.currency,
      direction: tpl.direction,
      category_id: tpl.category_id,
      description: tpl.description,
      occurred_at: rule.next_due_at,
      source: 'recurring',
      recurring_rule_id: rule.id,
    },
    schema_version: 1,
  }

  await db
    .insertInto('op_log')
    .values({
      id: op.id, user_id: userId, hlc: op.hlc, device_id: op.device_id,
      entity_kind: op.entity_kind, entity_id: op.entity_id,
      op_type: op.op_type, payload: JSON.stringify(op.payload),
      schema_version: op.schema_version, applied_at: Date.now(),
    })
    .execute()

  // Materialize the money_entries row directly (server side)
  const merged = applyOp(undefined, op)
  await db
    .insertInto('money_entries')
    .values({
      id: entryId, user_id: userId,
      amount: tpl.amount, currency: tpl.currency, direction: tpl.direction,
      category_id: tpl.category_id, description: tpl.description,
      occurred_at: rule.next_due_at, source: 'recurring',
      raw_input: null, recurring_rule_id: rule.id,
      field_hlcs: JSON.stringify(merged.field_hlcs),
      deleted_at: null,
      created_at: merged.created_at, updated_at: merged.updated_at,
    })
    .onConflict(oc => oc.column('id').doNothing())
    .execute()
}

function serverHlcFor(iso: string): string {
  // Use the entry's occurred_at as physical time, logical=0, deviceId='cron'.
  // This keeps HLC monotonicity sensible across runs and gives clients a clean
  // ordering for these synthetic ops.
  const ms = new Date(iso).getTime().toString().padStart(16, '0')
  return `${ms}-000000-cron`
}
```

- [ ] **Step 3: Run cron tests**

```powershell
pnpm test -- tests/api/cron-recur-route.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Add cron trigger to wrangler.toml**

Cloudflare invokes the cron via the Worker's `scheduled` handler. Edit `wrangler.toml` — append after the `[observability]` block:

```toml
[triggers]
# Phase 1.4: daily recurring-rules materializer
# Time: 02:00 UTC every day (low-traffic window globally).
# Per-user time-zone sharding is Phase 2.
crons = ["0 2 * * *"]
```

For Phase 1, the simplest valid path is the **internal HTTP call**: the route is reachable at `/api/cron/recur`. After deploy, verify with `wrangler tail` that the cron fires once per day and the route returns `{ processed: N }`.

> **Implementation note**: if OpenNext doesn't surface the `scheduled` Workers handler at all, the cron trigger won't actually invoke the route. In that case, deploy a separate "shim" Worker (NOT through OpenNext) at `pulse-cron` that does:
> ```js
> export default { async scheduled() { await fetch('https://pulse.sdsheikahamed.workers.dev/api/cron/recur', { method: 'POST', headers: { 'cf-cron': '0 2 * * *' } }) } }
> ```
> Configure that shim's wrangler.toml with `crons = ["0 2 * * *"]` and deploy separately. This is the **fallback path** if OpenNext doesn't expose `scheduled`. Phase 1.6 verifies the actual cron fires; budget half a day for this if the OpenNext path doesn't work.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/cron/recur/route.ts tests/api/cron-recur-route.test.ts wrangler.toml
git commit -m "feat(cron): daily recurring-rules materializer + trigger config"
```

---

## Task 24: Settings → Recurring page (list, pause, cancel)

**Files:**
- Create: `src/app/settings/recurring/page.tsx`
- Create: `src/hooks/use-recurring-rules.ts`

- [ ] **Step 1: Hook**

Create `src/hooks/use-recurring-rules.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type RecurringRuleRow } from '@/lib/dexie'

export function useRecurringRules(userId: string | undefined): RecurringRuleRow[] {
  return useLiveQuery<RecurringRuleRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.recurring_rules.where('user_id').equals(userId).toArray()
      return all
        .filter(r => !r.deleted_at)
        .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at))
    },
    [userId],
    [],
  ) ?? []
}
```

- [ ] **Step 2: Recurring settings page**

Create `src/app/settings/recurring/page.tsx`:

```typescript
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useCategories } from '@/hooks/use-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'

export default function RecurringSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const rules = useRecurringRules(userId ?? undefined)
  const categories = useCategories(userId ?? undefined)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  async function setActive(id: string, value: 0 | 1) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'recurring', entity_id: id,
      op_type: 'update', payload: { is_active: value },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(console.error)
  }

  async function deleteRule(id: string) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'recurring', entity_id: id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(console.error)
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recurring</h1>
        <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
      </header>

      <ul className="divide-y divide-border rounded-md border">
        {rules.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            No recurring rules. Toggle "Make recurring" on any entry to create one.
          </li>
        )}
        {rules.map(r => {
          const cat = r.category_id ? categoryById.get(r.category_id) : undefined
          const major = (r.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
          const sym = ({ INR: '₹', USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[r.currency] ?? r.currency
          const periodText = `every ${r.interval_count > 1 ? `${r.interval_count} ` : ''}${r.period.replace(/ly$/, '')}${r.interval_count > 1 ? 's' : ''}`
          return (
            <li key={r.id} className="flex flex-col gap-1 p-3">
              <div className="flex items-center justify-between">
                <span className={r.direction === 'out' ? 'text-rose-600' : 'text-emerald-600'}>
                  {r.direction === 'out' ? '-' : '+'}{sym}{major}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.is_active ? 'bg-emerald-500/20 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {r.is_active ? 'active' : 'paused'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {cat ? `${cat.icon ?? ''} ${cat.name} · ` : ''}{periodText} · next {r.next_due_at.slice(0, 10)}
              </span>
              <div className="mt-1 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setActive(r.id, r.is_active ? 0 : 1)}>
                  {r.is_active ? 'Pause' : 'Resume'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}>Delete</Button>
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Typecheck + smoke**

```powershell
pnpm typecheck
pnpm dev
```

Open `/settings/recurring` after creating a recurring rule via the chip. Verify list shows + pause/resume/delete works.

- [ ] **Step 4: Commit**

```powershell
git add src/app/settings/recurring/page.tsx src/hooks/use-recurring-rules.ts
git commit -m "feat(recurring): settings page to list + pause + delete rules"
```

---

**Sub-phase 1.4 done.** Recurring rules persist, sync, and the cron route is in place. The cron itself fires daily once deployed.

---

# Phase 1.5 — Dashboard + polish

## Task 25: MoneyCard summary component (headline + delta + top 3 categories)

**Files:**
- Create: `src/components/money-card.tsx`
- Modify: `src/app/app/page.tsx` (mount the card above the entry list)

- [ ] **Step 1: Build the card**

Create `src/components/money-card.tsx`:

```typescript
'use client'

import { useMemo } from 'react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'

type Props = { userId: string }

type PeriodKind = 'week' | 'month'

export function MoneyCard({ userId }: Props) {
  const period: PeriodKind = 'month'   // Phase 1 default; Phase 2 lets user toggle
  const range = useMemo(() => currentPeriodRange(period), [period])
  const prevRange = useMemo(() => previousPeriodRange(period, range), [period, range])

  const current = useMoneyEntries(userId, range)
  const previous = useMoneyEntries(userId, prevRange)
  const categories = useCategories(userId)
  const catName = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const currentSpend  = sumDirection(current,  'out')
  const previousSpend = sumDirection(previous, 'out')
  const delta = previousSpend === 0 ? null : ((currentSpend - previousSpend) / previousSpend) * 100

  const topCategories = useMemo(() => topNByCategory(current, catName, 3), [current, catName])
  const topMax = Math.max(1, ...topCategories.map(([, amt]) => amt))

  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">This month</span>
        {delta !== null && (
          <span className={`text-xs font-medium ${delta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(0)}% vs last
          </span>
        )}
      </header>
      <div className="text-3xl font-semibold tabular-nums">
        ₹{(currentSpend / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <ul className="flex flex-col gap-1.5 pt-1">
        {topCategories.length === 0 && (
          <li className="text-xs text-muted-foreground">No entries yet this {period}.</li>
        )}
        {topCategories.map(([cat, amt]) => (
          <li key={cat?.id ?? 'uncat'} className="flex items-center gap-2 text-xs">
            <span className="w-20 truncate">{cat?.icon ?? ''} {cat?.name ?? 'Uncategorized'}</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 bg-foreground/70"
                style={{ width: `${(amt / topMax) * 100}%` }}
              />
            </div>
            <span className="tabular-nums">₹{(amt / 100).toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function sumDirection(entries: ReturnType<typeof useMoneyEntries>, dir: 'out' | 'in'): number {
  return entries.filter(e => e.direction === dir).reduce((s, e) => s + e.amount, 0)
}

function topNByCategory(
  entries: ReturnType<typeof useMoneyEntries>,
  catName: Map<string, ReturnType<typeof useCategories>[number]>,
  n: number,
): Array<[ReturnType<typeof useCategories>[number] | undefined, number]> {
  const totals = new Map<string | undefined, number>()
  for (const e of entries) {
    if (e.direction !== 'out') continue
    const key = e.category_id ?? undefined
    totals.set(key, (totals.get(key) ?? 0) + e.amount)
  }
  return [...totals.entries()]
    .map(([cid, amt]) => [cid ? catName.get(cid) : undefined, amt] as [ReturnType<typeof useCategories>[number] | undefined, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

function currentPeriodRange(period: PeriodKind): { from: string; to: string } {
  const now = new Date()
  if (period === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    return { from, to }
  }
  // week: Mon → next Mon, UTC
  const day = now.getUTCDay() || 7   // 1..7, Sun=7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)))
  const nextMonday = new Date(monday); nextMonday.setUTCDate(nextMonday.getUTCDate() + 7)
  return { from: monday.toISOString(), to: nextMonday.toISOString() }
}

function previousPeriodRange(period: PeriodKind, current: { from: string; to: string }): { from: string; to: string } {
  const fromCur = new Date(current.from)
  if (period === 'month') {
    const from = new Date(Date.UTC(fromCur.getUTCFullYear(), fromCur.getUTCMonth() - 1, 1)).toISOString()
    return { from, to: current.from }
  }
  const toCur = new Date(current.to)
  toCur.setUTCDate(toCur.getUTCDate() - 7)
  const fromPrev = new Date(fromCur); fromPrev.setUTCDate(fromPrev.getUTCDate() - 7)
  return { from: fromPrev.toISOString(), to: current.from }
}
```

- [ ] **Step 2: Mount in /app**

Edit `src/app/app/page.tsx` — import and render above the manual-entry form:

```typescript
import { MoneyCard } from '@/components/money-card'
```

Within the JSX, immediately after `<p className="text-xs text-muted-foreground">Signed in as ...</p>`:

```typescript
<MoneyCard userId={user.id} />
```

- [ ] **Step 3: Typecheck + smoke**

```powershell
pnpm typecheck
pnpm dev
```

Open `/app`. With a couple of confirmed entries, verify:
- Headline shows current-month total
- Delta vs previous month renders (or hides on first month)
- Top 3 categories show with proportional bars

- [ ] **Step 4: Commit**

```powershell
git add src/components/money-card.tsx src/app/app/page.tsx
git commit -m "feat(dashboard): MoneyCard with headline + delta + top 3 categories"
```

---

## Task 26: Adaptive layout + long-press context menu

**Files:**
- Modify: `src/app/app/page.tsx` (responsive split: snapshot strip on mobile, sidebar on desktop)
- Modify: `src/components/money-list.tsx` (add long-press menu)

- [ ] **Step 1: Add the long-press context menu**

Edit `src/components/money-list.tsx` — wrap each `<li>` content with a long-press detector. Add at the top of the component:

```typescript
import { useRef } from 'react'

function useLongPress<T>(onLongPress: (arg: T) => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  return {
    onPointerDown: (arg: T) => {
      timerRef.current = setTimeout(() => onLongPress(arg), ms)
    },
    onPointerUp: () => { if (timerRef.current) clearTimeout(timerRef.current) },
    onPointerLeave: () => { if (timerRef.current) clearTimeout(timerRef.current) },
  }
}
```

Add menu state and wire into the entry `<li>`:

```typescript
const [menuFor, setMenuFor] = useState<string | null>(null)
const longPress = useLongPress<MoneyEntryRow>(e => setMenuFor(e.id))
```

In each `<li>`, attach `{...longPress}` handlers to the row and replace the inline Delete with a menu that appears for the active entry. Implementation choice: render a small popover below the row when `menuFor === e.id`:

```typescript
{menuFor === e.id && (
  <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
    <button type="button" className="px-3 py-1.5 text-xs hover:bg-accent" onClick={() => { deleteEntry(e); setMenuFor(null) }}>Delete</button>
    {e.recurring_rule_id && (
      <button type="button" className="px-3 py-1.5 text-xs hover:bg-accent" onClick={() => { /* TODO Phase 1.6: route to /settings/recurring */ setMenuFor(null) }}>Edit recurring rule</button>
    )}
    <button type="button" className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent" onClick={() => setMenuFor(null)}>Cancel</button>
  </div>
)}
```

Wrap the `<li>` in `<li className="relative ...">` so the absolute-positioned menu anchors to it.

- [ ] **Step 2: Adaptive layout — mobile-first sidebar**

Edit `src/app/app/page.tsx` — change the outer `<main>` from `max-w-md` to a responsive grid:

```typescript
<main className="mx-auto grid w-full max-w-5xl gap-6 p-6 md:grid-cols-[1fr_320px]">
  <div className="flex flex-col gap-6">
    <header className="...">...</header>
    {/* Mobile-only: MoneyCard goes above the chat */}
    <div className="md:hidden">
      <MoneyCard userId={user.id} />
    </div>
    {/* Voice + manual entry */}
    <div className="flex justify-center py-2">
      <VoiceRecorder ... />
    </div>
    <form ...>...</form>
    {draft && <ConfirmationChip ... />}
    <MoneyList userId={user.id} />
  </div>

  {/* Desktop-only sidebar */}
  <aside className="hidden md:block">
    <div className="sticky top-6 flex flex-col gap-4">
      <MoneyCard userId={user.id} />
    </div>
  </aside>
</main>
```

(The previously-mounted MoneyCard in Task 25 moves into one of these slots — drop the standalone mount.)

- [ ] **Step 3: Smoke on both viewports**

```powershell
pnpm dev
```

Open dev tools → toggle device emulation:
- Mobile: card appears above chat; long-press an entry → menu appears
- Desktop: card appears in right sidebar, sticky as the chat scrolls

- [ ] **Step 4: Commit**

```powershell
git add src/app/app/page.tsx src/components/money-list.tsx
git commit -m "feat(ux): adaptive sidebar/strip layout + long-press context menu"
```

---

**Sub-phase 1.5 done.** Dashboard summary live across week/month. Long-press menu wired. Mobile + desktop layouts both pleasant.

---

# Phase 1.6 — E2E + cleanup

## Task 27: Manual E2E verification + Phase 1 retro notes

**Files:**
- Create: `docs/superpowers/notes/phase-1-retro.md`

- [ ] **Step 1: Verify each success criterion from the spec**

Open the deployed app on both phone + desktop (signed into the same magic-link account). Walk through the checklist below; record outcomes.

```
[ ] Voice "spent 80 on chai" → chip in <3s median, <6s p95
[ ] Voice entry visible on second device within 10s
[ ] Toggle "Recurring" + pick monthly + confirm → rule appears in /settings/recurring
[ ] Wait for next 02:00 UTC OR manually POST /api/cron/recur with cf-cron header → entry auto-fires
[ ] Edit a past entry's category → both devices reflect within 10s
[ ] Voice "got salary 85000 yesterday" → direction=in, category=Salary, occurred_at=yesterday
[ ] money_agent adversarial set: pnpm test -- tests/agents/money-agent.test.ts → ≥95% pass (47/50)
[ ] Full suite: pnpm test → ≥120 tests pass
[ ] Phase 0 sync property tests: pnpm test -- tests/op-log.test.ts → still green
```

- [ ] **Step 2: Latency measurement**

Open Chrome DevTools → Network panel → record 5 voice round-trips back-to-back. Note times for `/api/voice`:

```
[ ] Median: ____ ms (target ≤3000)
[ ] p95:    ____ ms (target ≤6000)
```

If p95 > 6000ms, profile the agents:
- Add `console.time('whisper')` / `console.timeEnd('whisper')` around each step in `/api/voice/route.ts`
- The 70B parser is usually the slowest step; consider falling back to 8B for short utterances if median drifts.

- [ ] **Step 3: Write the Phase 1 retro doc**

Create `docs/superpowers/notes/phase-1-retro.md`:

```markdown
# Pulse Phase 1 retrospective

**Date closed:** <YYYY-MM-DD>
**Duration:** <N> weeks (planned 5–6)

## What shipped

- Voice money entry (Whisper → Router → money_agent)
- Manual money entry (typed text path through /api/agent)
- Categories (14 seeded + user CRUD)
- Recurring rules (toggle in chip + settings CRUD + daily cron)
- MoneyCard dashboard (headline + delta + top 3 categories)
- Adaptive layout (mobile strip, desktop sidebar)
- Long-press context menu + undo-toast deletes
- ~70 new tests on top of the 50 Phase 0 tests

## Metrics

- Voice round-trip median: ___ ms
- Voice round-trip p95: ___ ms
- money_agent adversarial pass rate (mocked): ___ / 50
- money_agent adversarial pass rate (real Groq via scripts/eval-agents.ts): ___ / 50
- $ runtime cost this phase: $___ (target $0)
- Days logged by Sheik consecutively (trust threshold): ___

## What worked

(Sheik fills in)

## What we'd do differently

(Sheik fills in)

## Phase 2 prereqs surfaced

- query_money agent ("how much did I spend last week")
- Per-user TZ for cron (currently 02:00 UTC global)
- Multi-currency FX in dashboard totals
- Voice-detected recurring (hybrid mode)
- Insights / push notifications / weekly retros
- Tasks / projects / learning / notes domains
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/notes/phase-1-retro.md
git commit -m "docs: Phase 1 retro template"
```

---

## Task 28: scripts/eval-agents.ts — real-Groq fixture runner (dev tool)

**Files:**
- Create: `scripts/eval-agents.ts`

> This is a **dev tool**, not part of the test suite. It calls REAL Groq with the same fixture set to validate prompt edits. It's not run in CI.

- [ ] **Step 1: Implement the runner**

Create `scripts/eval-agents.ts`:

```typescript
#!/usr/bin/env -S node --experimental-strip-types
/**
 * Run the money_agent adversarial fixtures against REAL Groq.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_... pnpm exec tsx scripts/eval-agents.ts
 *
 * Output: per-case pass/fail + summary. NOT a test suite — manual eval before
 * merging prompt edits.
 */
import { makeGroqClient } from '../src/lib/agents/llm-client.ts'
import { parseMoneyEntry } from '../src/lib/agents/money-agent.ts'
import { CASES, TEST_CATEGORIES } from '../tests/fixtures/money-agent-cases.ts'

async function main() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY required')
  const client = makeGroqClient(apiKey)

  let passed = 0
  let failed = 0
  const failures: string[] = []

  for (const c of CASES) {
    try {
      const out = await parseMoneyEntry({
        client,
        text: c.text,
        categories: TEST_CATEGORIES,
        nowIso: '2026-06-18T14:30:00.000Z',
      })
      const issues: string[] = []
      for (const [k, v] of Object.entries(c.expect)) {
        // @ts-expect-error indexed
        if (JSON.stringify(out[k]) !== JSON.stringify(v)) issues.push(`${k}: got ${JSON.stringify(out[k])}, expected ${JSON.stringify(v)}`)
      }
      if (issues.length === 0) {
        passed++
        console.log(`PASS ${c.id} "${c.text}"`)
      } else {
        failed++
        failures.push(`FAIL ${c.id} "${c.text}"\n  ${issues.join('\n  ')}`)
        console.log(`FAIL ${c.id} "${c.text}"`)
        for (const i of issues) console.log(`  - ${i}`)
      }
    } catch (err) {
      failed++
      failures.push(`ERROR ${c.id} "${c.text}" — ${(err as Error).message}`)
      console.log(`ERROR ${c.id} ${(err as Error).message}`)
    }
  }

  console.log(`\n===== Summary =====`)
  console.log(`PASS: ${passed} / ${CASES.length}`)
  console.log(`FAIL: ${failed}`)
  console.log(`Rate: ${((passed / CASES.length) * 100).toFixed(1)}%`)

  if (failed > 0 && process.env.STRICT === '1') process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run against real Groq**

```powershell
$env:GROQ_API_KEY="gsk_..."
pnpm exec tsx scripts/eval-agents.ts
```

Expected: ≥95% pass rate (≥47/50). Failures should be investigated — likely prompt tweaks.

- [ ] **Step 3: Commit**

```powershell
git add scripts/eval-agents.ts
git commit -m "chore(dev): scripts/eval-agents.ts to validate prompts against real Groq"
```

---

**Sub-phase 1.6 done.** All success criteria from the spec verified. Phase 1 closed.

---

# Self-review

Run through this checklist before declaring the plan ready for execution.

## Spec coverage

| Spec section | Implemented in task(s) |
|---|---|
| Voice-first entry (tap mic → speak → confirm) | 20 + (chip) 11 |
| Money domain (spend/income/recurring) | 1 (schema) + 11 (chip) + 21–24 (recurring) |
| AI categorization | 17 (money_agent) + 18 (fixtures) + 28 (eval) |
| Confirmation chip (always-expanded inline) | 11 + 22 (recurring toggle) |
| Recurring engine | 21 (compute) + 22 (toggle) + 23 (cron) + 24 (settings) |
| Dashboard snapshot card | 25 |
| Edit/delete + undo + long-press menu | 10 (undo) + 13 (inline delete) + 26 (long-press) |
| Op-log integration (no parallel sync path) | 1 (schema reuse) + 5/6 (apply branches) |
| Total runtime cost $0/month | (no Stripe/paid APIs; Groq free tier) |
| FX, voice-detected recurring, query_money, receipts, per-user TZ, push notifications | Deferred per spec — none implemented |
| ≥120 tests passing | Phase 0 50 + Phase 1 ~70 in tasks 2/3/4/5/6/7/14/15/16/18/19/20/21/23 |
| Voice round-trip median ≤3s / p95 ≤6s | Verified in task 27 |
| money_agent adversarial ≥95% | Task 18 (mock) + task 28 (real) |
| Phase 0 unchanged | Tasks add new files only; sync route is extended via switch not rewritten |

All spec sections accounted for.

## Type consistency

- `ChipDraft` (task 11) uses `MoneyPayload` shape; `confirmEntry` (tasks 13 + 22) destructures the same fields.
- `RecurringRule` (task 21) matches the columns added to D1 in task 1 and the `RecurringRuleRow` Dexie type in task 3.
- Op `entity_kind` values match `ENTITY_KINDS` in `src/types/ops.ts` (no new values added — they already exist).
- `MoneyAgentResponse.category_name` is `string | null`; `/api/voice` and `/api/agent` resolve it to `category_id` via `cats.find`.
- `Currency` enum (`src/lib/op-schemas/money.ts`) reused by `MoneyAgentResponse`.

## Placeholder scan

No `TBD`, `TODO`, `implement later`, or `similar to Task N` patterns. The one inline-code `TODO Phase 1.6` in Task 26 (`/* TODO Phase 1.6: route to /settings/recurring */`) is a deliberate signal for a follow-up wire — replace it before close: change `onClick={() => { setMenuFor(null) }}` to `onClick={() => { router.push('/settings/recurring'); setMenuFor(null) }}` when wiring 26's long-press menu.

## Known gotchas captured inline

- **Cron via OpenNext:** Task 23 Step 4 documents the fallback "shim Worker" path if OpenNext doesn't expose the `scheduled` Workers handler.
- **Voice-queue retry cap:** Task 20 fixes maxRetries=3 by design; further failures need manual user action (next-phase: surface "pending chips" UI).
- **End-condition until/count:** Task 21 `checkEndConditions` is invoked **after** `computeNextDue` advances `next_due_at`. Task 23's cron emits the entry BEFORE deactivating, which is the spec's intent (the deactivating fire is the last one).

---

# Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-pulse-phase-1-voice-money.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a 28-task plan with isolated TDD cycles. Each subagent reads only the one task it's executing — no context-window concerns.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints. Best if you want to watch each step happen in real time and can stay in the session.

Which approach?
