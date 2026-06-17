# Pulse — Phase 1: Voice + Money Domain

**Design spec**
**Status:** Draft v1 — awaiting Sheik's review
**Date:** 2026-06-16
**Owner:** Sheik (stains.j@tcs.com)
**Builds on:** Phase 0 (closed 2026-06-16) — see `docs/superpowers/specs/2026-06-15-pulse-design.md` and `docs/superpowers/notes/phase-0-retro.md`.

---

## TL;DR

Phase 1 turns the deployed-but-empty Pulse PWA into a **voice-first personal money tracker**. Users tap a mic, say "spent 80 on chai," see a confirmation chip with the parsed amount + category + direction, and confirm. The entry appears on every signed-in device within seconds. Recurring expenses (rent, salary, subscriptions) are first-class — a single toggle on the chip turns any entry into a recurring rule that auto-fires via a daily cron.

The phase has three new tables (`money_entries`, `recurring_rules`, `categories`), three new agents (Whisper transcription, Router intent classifier, money_agent payload parser — all on Groq's free tier), a daily cron job for recurring materialization, and zero edits to the Phase 0 sync engine.

Built on the foundation Phase 0 closed: Cloudflare Workers + D1 + Kysely + Better Auth + OpenNext + HLC op-log sync, deployed via GitHub Actions, $0/month runtime.

---

## Audience

- **Primary user:** Sheik. v1 success means he opens the PWA on his phone every day, logs his actual real-world expenses + income + recurring rules via voice, and trusts the AI enough that he doesn't fight it.
- **Secondary user:** the open-source community evaluating "AI-native life OS" patterns. Self-hostable; BYOK-compatible; Apache 2.0.

Personal daily use is the success metric. OSS adoption is gravy.

---

## Problem statement

Existing money trackers fall into two camps. **Bank-aggregator apps** (Mint, Walnut) pull from credit card / UPI feeds but miss cash transactions, hide categorization in opaque ML, and stop working when bank APIs break or get monetized. **Manual log apps** (You Need A Budget, Money Manager) require ~5 taps per entry — friction that erodes daily logging within weeks.

**Voice-first manual logging** sits in the gap: low enough friction that the user actually logs every transaction (one tap + "spent 80 on chai" + one confirm), but explicit enough that there's no mystery categorization or feed lag. The AI handles the tedious parts (amount extraction, category inference, currency parsing) while the user stays in control of what gets recorded.

Phase 1 is also the **first phase where Pulse delivers user value**. Phase 0 was infrastructure; the Widget toy entity was a proof-of-life for the sync engine. Phase 1 is the moment the app becomes useful.

---

## Goals (Phase 1)

1. **Voice-first entry**: tap mic, speak, confirm. ~5 seconds total wall time.
2. **Money domain**: spend, income, recurring rules. All three from day one.
3. **AI categorization** via Groq Llama 3.1 70B: pick from a seeded category list, infer direction (out/in), parse amounts in INR and other ISO 4217 currencies.
4. **Confirmation chip** showing all parsed fields editable inline + a visible "Make recurring" toggle.
5. **Recurring engine**: simple period + interval (daily/weekly/monthly/yearly × N), end conditions (never/until-date/count). Cron-materialized via the op-log.
6. **Dashboard snapshot card** at the top of the mobile chat (and in the desktop sidebar): headline ₹ for the current period + delta vs previous + top 3 categories with mini bars.
7. **Edit/delete** via tap-to-expand inline actions with undo-toast pattern. Long-press for power-user context menu.
8. **All money writes flow through the Phase 0 op-log** — no parallel sync path. Recurring cron writes Ops; clients receive them via the existing `/api/sync` endpoint.
9. **Total runtime cost: $0/month** at personal scale. Groq free tier.

## Non-goals (Phase 1)

- **FX conversion**: store per-entry currency, but no dashboard-wide conversion to a single total. Phase 2.
- **Voice-detected recurring**: recurring rules are toggle-driven, not voice-detected ("I pay rent every month" doesn't auto-create a rule). Phase 2 hybrid mode.
- **Voice progress streaming (SSE)**: single round-trip with one spinner in Phase 1. Phase 1.5 / Phase 2 polish.
- **Receipt photo parsing** (Llama Vision): Phase 3 alongside the insight engine.
- **`query_money` agent** ("how much did I spend last week?"): Phase 2 alongside insights.
- **Per-user time-zone cron**: Phase 1 cron is 02:00 UTC globally. Phase 2 sharding.
- **Insights, push notifications, weekly retros**: all Phase 3.
- **Tasks, projects, learning, notes**: the other Big Three domains; their phases come after.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│                       DEVICE (PWA)                            │
│                                                               │
│  UI — Adaptive layout (same shell as Phase 0)                 │
│    Mobile:  [dashboard snapshot strip] + [chat with chips]    │
│    Desktop: [dashboard sidebar]        + [chat panel]         │
│                                                               │
│  Voice: tap mic → MediaRecorder → opus blob                   │
│         → POST /api/voice (multipart) → wait for JSON         │
│         → render confirmation chip (always-expanded, editable)│
│         → user confirms / cancels                             │
│  On confirm: client generates an Op (kind=money) → applies    │
│         locally → queues to sync via Phase 0's op-log path    │
│                                                               │
│  Edit/delete: tap entry → inline action row.                  │
│         Long-press → context menu (power-user shortcut).      │
│                                                               │
│  Local store (Dexie) — NEW tables this phase:                 │
│    money_entries, recurring_rules, categories                 │
│    All flow through the existing op-log + sync engine.        │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS
                             ▼
┌──────────────────────────────────────────────────────────────┐
│            CLOUDFLARE EDGE (Pages + Workers)                  │
│                                                               │
│  Routes:                                                      │
│   • POST /api/voice    multipart audio → parsed-payload JSON  │
│                        (Whisper → Router → money_agent;      │
│                         single round-trip)                    │
│   • POST /api/agent    typed text → parsed-payload JSON       │
│                        (fallback when voice fails/unavailable)│
│   • POST /api/sync     UNCHANGED from Phase 0                 │
│   • /api/auth/*        UNCHANGED from Phase 0                 │
│   • POST /api/cron/recur  cron-triggered; materializes rules  │
│                                                               │
│  Cron triggers:                                               │
│   • daily-recurring   02:00 UTC — walks recurring_rules,      │
│                       emits Ops for due entries               │
└──────────┬──────────────────────────────────┬────────────────┘
           ▼                                  ▼
┌─────────────────────────────┐    ┌──────────────────────────┐
│   D1 (SQLite)                │    │   Groq API (free tier)   │
│   NEW Phase 1 tables:         │    │   • whisper-large-v3-turbo│
│   • money_entries             │    │   • llama-3.1-8b   (router)│
│   • recurring_rules           │    │   • llama-3.1-70b  (money)│
│   • categories                │    └──────────────────────────┘
│                               │
│   UNCHANGED from Phase 0:     │
│   user, session, account,     │
│   verification, devices,      │
│   op_log, widgets             │
└─────────────────────────────┘
```

**Key properties:**

- **One HTTP round-trip per voice entry.** `/api/voice` internally orchestrates Whisper → Router → money_agent. Client shows a single spinner for ~2-4 s.
- **All writes go through the op-log.** Recurring rule fires → cron emits an Op → flows through `/api/sync` to all the user's devices like any other entry. No parallel sync path.
- **Phase 0 infrastructure is UNCHANGED.** No edits to auth, op_log, sync, widgets, HLC. Phase 1 is additive: new D1 tables, new Dexie schema version, new routes, new agent files.
- **Categories sync via the op-log** (entity_kind=`category`) — same path as everything else. One sync engine, zero special cases.

---

## Data model + schema additions

Migration: `migrations/0002_phase_1_money.sql`. Dexie schema version bumped to v2.

### money_entries

```sql
CREATE TABLE money_entries (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount             INTEGER NOT NULL,                       -- smallest unit (paise/cents)
  currency           TEXT    NOT NULL DEFAULT 'INR',         -- ISO 4217
  direction          TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id        TEXT    REFERENCES categories(id),
  description        TEXT,                                   -- "chai", "Uber to airport"
  occurred_at        TEXT    NOT NULL,                       -- ISO 8601
  source             TEXT    NOT NULL CHECK (source IN ('voice', 'manual', 'recurring')),
  raw_input          TEXT,                                   -- original transcript / typed text
  recurring_rule_id  TEXT    REFERENCES recurring_rules(id), -- nullable; set if cron-generated
  -- Phase 0 LWW columns
  field_hlcs         TEXT    NOT NULL,
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX idx_money_user_occurred  ON money_entries(user_id, occurred_at DESC);
CREATE INDEX idx_money_user_recurring ON money_entries(user_id, recurring_rule_id);
```

**Design notes:**
- `amount` is `INTEGER` in smallest unit (₹80 → 8000 paise; $5.50 → 550 cents). Eliminates floating-point bugs. UI formats on display.
- `direction` is a single `'out' | 'in'` column — not separate spend/income tables.
- `source` enum lets us answer "how was this logged?" — useful for analytics, debugging, and adversarial-test mining.
- `recurring_rule_id` is nullable. When set, the UI can offer "Edit this one" vs "Edit the rule."
- `raw_input` preserves the original voice transcript or typed text — audit + future adversarial-test data.

### recurring_rules

```sql
CREATE TABLE recurring_rules (
  id                  TEXT    PRIMARY KEY NOT NULL,
  user_id             TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  -- template (what each occurrence becomes)
  amount              INTEGER NOT NULL,
  currency            TEXT    NOT NULL DEFAULT 'INR',
  direction           TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id         TEXT    REFERENCES categories(id),
  description         TEXT,
  -- schedule
  period              TEXT    NOT NULL CHECK (period IN ('daily','weekly','monthly','yearly')),
  interval_count      INTEGER NOT NULL DEFAULT 1,            -- every N periods
  anchor_at           TEXT    NOT NULL,                      -- first occurrence (ISO)
  next_due_at         TEXT    NOT NULL,                      -- cron fires next on this date
  end_condition_kind  TEXT    NOT NULL DEFAULT 'never' CHECK (end_condition_kind IN ('never','until','count')),
  end_until           TEXT,                                  -- if kind='until'
  end_count           INTEGER,                               -- if kind='count'
  occurrences_so_far  INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,            -- 0 = paused/canceled
  -- Phase 0 LWW columns
  field_hlcs          TEXT    NOT NULL,
  deleted_at          TEXT,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE INDEX idx_recurring_due
  ON recurring_rules(next_due_at)
  WHERE is_active = 1 AND deleted_at IS NULL;
```

- Partial index keeps the cron's query lookup tiny (only rows the cron cares about).
- `anchor_at` vs `next_due_at` separation: anchor is "when did the user originally schedule this," next_due_at is "when does it fire next." Lets us recompute next_due forward after edits without losing the anchor.

### categories

```sql
CREATE TABLE categories (
  id            TEXT    PRIMARY KEY NOT NULL,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('spend', 'income')),
  icon          TEXT,                                       -- emoji or icon name
  color         TEXT,                                       -- Tailwind color name
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_archived   INTEGER NOT NULL DEFAULT 0,
  -- Phase 0 LWW columns
  field_hlcs    TEXT    NOT NULL,
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  UNIQUE (user_id, name, kind)
);

CREATE INDEX idx_categories_user_kind ON categories(user_id, kind);
```

### Seeded default categories

On first sign-in (idempotent: only if the user has zero categories), the server inserts 14 default categories via Ops:

| kind | name | icon |
|---|---|---|
| spend | Food | 🍴 |
| spend | Transport | 🚗 |
| spend | Rent | 🏠 |
| spend | Bills | 💡 |
| spend | Shopping | 🛍️ |
| spend | Entertainment | 🎬 |
| spend | Health | 🏥 |
| spend | Personal | 👤 |
| spend | Misc | ⋯ |
| income | Salary | 💼 |
| income | Freelance | 💻 |
| income | Refund | ↩️ |
| income | Investment | 📈 |
| income | Gift | 🎁 |

Users can edit / add / archive from Settings → Categories.

### Op type extensions

The Phase 0 `Op.entity_kind` enum is extended:

```ts
export const ENTITY_KINDS = [
  'widget',        // Phase 0 — kept as reference impl
  'money',         // Phase 1 — money_entries
  'recurring',     // Phase 1 — recurring_rules
  'category',      // Phase 1 — categories
  // Phase 2+: 'task', 'project', 'learning', 'note', 'budget', 'insight'
] as const
```

Per-kind Zod payload schemas live in `src/lib/op-schemas/{money,recurring,category}.ts`. `applyOp` in `src/lib/op-log.ts` looks up the schema by `op.entity_kind`, validates the payload, then routes to the right table materializer.

### Dexie schema (v2)

```ts
class PulseDb extends Dexie {
  op_log!:           EntityTable<Op, 'id'>
  widgets!:          EntityTable<EntityRow, 'id'>
  sync_meta!:        EntityTable<SyncMeta, 'key'>
  voice_queue!:      EntityTable<VoiceQueueItem, 'id'>
  // NEW Phase 1
  money_entries!:    EntityTable<MoneyRow, 'id'>
  recurring_rules!:  EntityTable<RecurringRow, 'id'>
  categories!:       EntityTable<CategoryRow, 'id'>

  constructor() {
    super('pulse')
    this.version(1).stores({
      op_log: 'id, hlc, entity_kind, entity_id',
      widgets: 'id, user_id, updated_at',
      sync_meta: 'key',
      voice_queue: 'id, status, created_at',
    })
    this.version(2).stores({
      money_entries:    'id, user_id, occurred_at, [user_id+occurred_at], category_id, recurring_rule_id',
      recurring_rules:  'id, user_id, next_due_at, is_active',
      categories:       'id, user_id, [user_id+kind], sort_order',
    })
  }
}
```

Compound indexes (`[user_id+occurred_at]`) match the most-common dashboard query.

---

## Agent topology + voice pipeline

### Voice path — single round trip

```
CLIENT                                          SERVER
═════                                           ══════
tap mic
  └─► MediaRecorder (audio/webm; codecs=opus, 16 kHz mono)
tap stop
  └─► blob → POST /api/voice (multipart)
       ▼                                ┌──────────────────────────────────┐
                                        │ 1. Auth check (Better Auth)      │
                                        │ 2. Extract audio blob            │
                                        │ 3. Groq Whisper → transcript      │
                                        │ 4. Router (Llama 8B): intent ∈   │
                                        │    { log_money, query_money,     │
                                        │      chat } + confidence         │
                                        │ 5. Dispatch:                     │
                                        │    log_money → money_agent (70B) │
                                        │                  → parsed payload │
                                        │    query_money → Phase 2 stub    │
                                        │    chat → Phase 2 stub           │
                                        │ 6. Return JSON                   │
                                        └──────────────────────────────────┘
       ◄── { transcript, intent, confidence, payload, errors }
render chip
  └─► user confirms → Op (kind=money) → applied → sync via Phase 0
```

Wall time target: median ≤3 s, p95 ≤6 s.

### Module layout

```
src/lib/agents/
  whisper.ts              — groqWhisper(blob, apiKey) → { transcript, lang, duration_ms }
  router.ts               — routeIntent(text, apiKey) → { intent, confidence }
  money-agent.ts          — parseMoneyEntry(text, categories, apiKey) → MoneyPayload
  llm-client.ts           — Groq SDK wrapper (retry, backoff, rate-limit)
  prompts/
    router.ts             — ROUTER_SYSTEM_PROMPT + few-shot examples
    money-agent.ts        — MONEY_AGENT_SYSTEM_PROMPT + few-shot examples
  schemas/
    router-response.ts    — Zod schema for Router output
    money-agent-response.ts — Zod schema for money_agent output

src/app/api/voice/route.ts  — single endpoint orchestrating the three above
src/app/api/agent/route.ts  — typed-text fallback (skips Whisper)
src/app/api/cron/recur/route.ts — recurring engine (see next section)
```

Each agent function is independently testable — pass in a fake `llm-client` returning canned responses in unit tests; CI doesn't burn Groq rate limits.

### Router (Llama 3.1 8B Instant, JSON mode)

Three-class classifier: `log_money` | `query_money` | `chat`. Few-shot examples per class (~10 each) in the prompt. Confidence < 0.7 surfaces a disambiguation chip in the client. Latency target: ~200 ms.

### money_agent (Llama 3.1 70B Versatile, JSON mode)

Extracts a structured payload from the transcript:

```ts
{
  amount: number          // integer in smallest unit
  currency: string        // ISO 4217 — default INR, AI infers from cues
  direction: 'out' | 'in' // inferred from verb ("spent" vs "got")
  category_name: string   // picked from current categories list (injected at request time)
  description: string     // ≤6 words, captures what the money was for
  occurred_at: string     // ISO 8601, defaults to now
}
```

The categories list is INJECTED into the system prompt at request time (server reads from D1, templates into the prompt). The agent always picks from the active list. Latency target: ~700-1500 ms.

### Adversarial test set

A Phase 1 deliverable: ~50 hand-crafted cases in `tests/agents/money-agent.test.ts` covering:

- Happy path (10): basic spend, basic income, with category, with description
- Currency parsing (8): INR/USD/EUR/AED, abbreviated forms, conflicting cues
- Amount edge cases (8): decimals, lakhs, k-suffix, ranges, no-amount-detected
- Direction ambiguity (6): "paid back to me," "owe X," "credit"
- Date parsing (5): "yesterday," "last Tuesday," "next month"
- Category inference (8): novel words ("samosa" → Food), brand names ("Netflix" → Entertainment)
- Failures (5): empty input, gibberish, only an amount, only a category

Tests use a **mock Groq client**; CI doesn't call real Groq. A dev script (`scripts/eval-agents.ts`) runs the same fixtures against real Groq to validate prompt edits before merge.

### Voice queue (offline)

If `/api/voice` fails at recording time (network):

```ts
type VoiceQueueItem = {
  id: string
  blob: Blob
  created_at: string
  retry_count: number
  status: 'queued' | 'transcribing' | 'done' | 'failed'
}
```

Stored in Dexie `voice_queue`. Drained on next online event OR on app open. Each blob processes through the same `/api/voice` endpoint; failed entries stay queued (up to 3 retries) and surface as a "pending chips" stack in the UI.

### Error handling

| Failure | Recovery |
|---|---|
| Mic permission denied | Banner: "Enable microphone in browser settings" + manual text input visible |
| Network offline at upload | Blob queued in `voice_queue`; UI shows "Queued — will process when online" |
| Whisper API 5xx / rate-limited | Exponential backoff (3s, 9s, 27s); 3 attempts; then transcript-failed banner |
| Whisper returns empty transcript | "Couldn't understand — try again" + manual text input |
| Router confidence < 0.7 | Disambiguation chip: "Did you mean to log money or ask about it?" |
| money_agent: no amount detected | Chip shows transcript + manual form pre-filled with any partial fields |
| money_agent: schema validation fails | Auto-retry once with strict-JSON prompt; second failure → manual form |
| Cron recurring run fails | Logged in CF observability; idempotent retry; next user open re-checks `recurring_rules` |

---

## Recurring engine

### Cron route

```ts
// src/app/api/cron/recur/route.ts (skeleton)
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!isCloudflareCron(req)) return new Response('Forbidden', { status: 403 })

  const db = createDb(getCloudflareContext().env.DB)
  const dueRules = await db
    .selectFrom('recurring_rules')
    .selectAll()
    .where('next_due_at', '<=', new Date().toISOString())
    .where('is_active', '=', 1)
    .where('deleted_at', 'is', null)
    .limit(1000)
    .execute()

  for (const rule of dueRules) await processRule(db, rule)
  return Response.json({ processed: dueRules.length })
}

async function processRule(db, rule) {
  let current = rule
  let safety = 100   // catch-up cap per rule per run
  while (current.next_due_at <= new Date().toISOString() && safety-- > 0) {
    const opId = `recur-${current.id}-${current.next_due_at}`
    await applyOp(db, buildMoneyOp(current, opId, /* device_id */ 'recur'))

    current = {
      ...current,
      next_due_at: computeNextDue(current),
      occurrences_so_far: current.occurrences_so_far + 1,
      ...checkEndConditions(current),
    }
    await applyOp(db, buildRecurringRuleUpdateOp(current))
  }
}
```

Trigger config in `wrangler.toml`:

```toml
[triggers]
crons = ["0 2 * * *"]   # 02:00 UTC daily
```

### Edge cases

| Edge case | Behavior |
|---|---|
| **Month-end rollover** (rule on 31st, Feb has 28) | `date-fns` `addMonths` clamps to last day; Jan 31 → Feb 28 → Mar 31 → Apr 30 |
| **Cron downtime catch-up** (e.g. 3 days missed) | Inner `while` loops one entry per missed period (cap 100) |
| **Duplicate cron run** | Deterministic op id (`recur-<rule_id>-<next_due_at>`) → op-log idempotency catches duplicates |
| **User cancels mid-recurrence** | `is_active = 0` toggle; cron skips next run; existing entries kept |
| **End condition reached** (count or until) | Set `is_active = 0` automatically after the final entry |
| **Time zone** | Phase 1 cron is 02:00 UTC global; Phase 2 polish for per-user TZ |

`computeNextDue` has its own 20-case unit test covering month-end, leap year (Feb 29), DST transitions, and weekly boundaries.

---

## Build phases within Phase 1 (~5–6 weeks)

| Sub-phase | Weeks | Deliverables | "Done" looks like |
|---|---|---|---|
| **1.0 Schema + types** | 1 | `0002_phase_1_money.sql`; Dexie v2 bump; Op kind extensions; Zod schemas for money/recurring/category | 50 Phase 0 tests pass + ~20 new unit tests for the new Op kinds |
| **1.1 Categories + seed** | 1.5 | Seed-on-first-signin (idempotent); Settings → Categories CRUD UI; category sync via op-log | Phone-created category appears on desktop within 10s |
| **1.2 Manual money entry** | 2 | Always-expanded chip UI; edit/delete inline actions + undo toast; manual `/api/agent` text endpoint | Typed entry "₹80 chai food" round-trips phone↔desktop |
| **1.3 Voice + agents** | 2.5–3.5 | `whisper.ts`; `router.ts`; `money-agent.ts`; `llm-client.ts`; `/api/voice` route; MediaRecorder client; voice queue offline buffer; ~50 adversarial cases | Voice "spent 80 on chai" → logged + visible on both devices in <5s |
| **1.4 Recurring engine** | 4 | "Make recurring" toggle expansion in chip; `/api/cron/recur` route + wrangler trigger; Settings → Recurring CRUD; catch-up + idempotency logic; `computeNextDue` tests | Rule fires next morning; entry appears on both devices |
| **1.5 Dashboard + polish** | 4.5 | Money summary card (headline + delta + top 3 categories); mobile snapshot strip + desktop sidebar; long-press context menu | Card reads correctly across week/month transitions |
| **1.6 E2E + cleanup** | 5 | Multi-device verification on physical phone; latency check; Phase 1 retro + Phase 2 prereqs note | All success criteria below verified |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Groq Whisper accuracy on Indian-English voice | Medium | Medium | Chip catches errors pre-commit; can swap to `whisper-large-v3` (non-turbo) at higher latency if needed |
| money_agent misclassifies direction (out vs in) | Medium | Low | Adversarial tests target this; chip lets user flip in one tap; direction badge visible by default |
| Recurring cron missing a run | Low | Medium | Deterministic op ids → idempotent retry; catch-up loop on next run; CF observability logs |
| Category drift ("Food", "food", "FOOD") | Low | Low | `UNIQUE(user_id, name, kind)` constraint; agent always picks from active list |
| Voice blob upload times out on slow mobile network | Medium | Medium | Voice queue offline buffer; auto-retry on reconnect; clear "queued" UI state |
| Groq free-tier RPM hit at personal scale | Low | Medium | Exponential backoff; BYOK documented for OSS users |
| Edit confusion on recurring-derived entries | Medium | Low | `recurring_rule_id` back-pointer enables "Edit this one" vs "Edit the rule" UI |
| Schema migration breaks Phase 0 data | Low | High | Additive only (new tables, no edits); 50 Phase 0 tests run in CI guard |
| iOS Safari mic permission denial in PWA | High (iOS) | Medium | Typed fallback always available; documented iOS limitation in README |
| Phase 1 timeline overrun (recurring is the wildcard) | Medium | Medium | Sub-phases shipped incrementally; if recurring slips, ship voice+manual first and land recurring as 1.5 |

---

## Success criteria

**Behavioral — Phase 1 ships when ALL of these hold:**

- [ ] Voice "spent 80 on chai" → confirmed chip → visible on second device, all within 10 seconds
- [ ] User toggles "Recurring" in chip + picks "monthly" + confirms → rule appears in Settings → Recurring; the next morning the entry auto-fires
- [ ] User edits a past entry's category → both devices reflect within 10 seconds
- [ ] User says "got salary 85000 yesterday" → entry direction=`in`, category=`Salary`, occurred_at=yesterday
- [ ] User logs ≥3 voice entries per day for 7 consecutive days (trust threshold)
- [ ] Recurring rules run for ≥7 days unattended without missing fires

**Technical:**

- [ ] ≥120 tests passing in CI (50 Phase 0 + ~70 Phase 1)
- [ ] money_agent adversarial set: ≥95% pass rate against mocked Groq client; ≥95% in manual eval against real Groq
- [ ] Voice round-trip latency: median ≤3s, p95 ≤6s
- [ ] CI workflow green on `main`; no Phase 0 sync property-test regressions

---

## Items deferred to Phase 2+

- **Voice progress streaming (SSE)** — visible "transcribing... parsing..." feedback during the 2-4s wait
- **Per-user TZ for cron** — currently 02:00 UTC global
- **Multi-currency FX conversion** in dashboard totals
- **Voice-detected recurring** (hybrid auto-detect mode)
- **`query_money` agent** ("how much did I spend last week?") — pairs with insight engine
- **Receipt photo parsing** (Llama 3.2 Vision) — Phase 3
- **Spending insights, anomaly detection, push notifications** — Phase 3
- **Tasks / projects / learning / notes domains** — Phase 2

---

## References

- Phase 0 spec: `docs/superpowers/specs/2026-06-15-pulse-design.md`
- Phase 0 retro: `docs/superpowers/notes/phase-0-retro.md`
- Xata → D1 pivot: `docs/superpowers/notes/2026-06-15-xata-to-d1-pivot.md`
- Cloudflare cron triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Groq API + models: <https://console.groq.com/docs/>
- Better Auth: <https://www.better-auth.com/>
- date-fns (for `computeNextDue`): <https://date-fns.org/>
- Kysely (existing): <https://kysely.dev/>

---

## Sign-off

This spec is approved for handoff to the writing-plans skill when Sheik signs off.
