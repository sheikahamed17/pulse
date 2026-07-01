# Pulse — Phase 2: Tasks + Polish

**Design spec**
**Status:** Draft v1 — awaiting Sheik's review
**Date:** 2026-06-18
**Owner:** Sheik (sdsheikahamed@gmail.com)
**Builds on:** Phase 1 (closed + merged 2026-06-18, tag `v1.0-phase-1`) — see `docs/superpowers/specs/2026-06-16-pulse-phase-1-voice-money-design.md` and `docs/superpowers/notes/phase-1-retro.md`.

---

## TL;DR

Phase 2 adds the **Tasks** domain (the second of the Big Four) and bundles four high-impact deferred items from the Phase 1 retro: a `query_money` agent ("how much did I spend last week"), voice **SSE streaming** for step-by-step round-trip feedback, **multi-currency FX** in the dashboard via daily ECB-cached rates, and **per-user time-zone** support so voice "tomorrow at 3pm" resolves to the user's local time.

A new **tab bar shell** (Money | Tasks) introduces the UI scaffold for the rest of the Big Four (Learning + Notes land in Phase 3+). All voice/text input remains in a single shared header; the chip dispatches to either tab based on the Router intent.

Architecture is purely additive to Phase 1's foundation. New `entity_kind: 'task'` joins money/recurring/category in the existing op-log → applyLocalOp → /api/sync materializer flow. A new `task_agent` (Llama 3.1 70B) parses voice into structured tasks. A new `query_money_agent` introduces Pulse's first read-only agent pattern (returns a query plan; client executes against Dexie). A new `/api/cron/fx` route fetches ECB rates daily into a `fx_rates` D1 table.

Scope is intentionally Phase-1-sized + ~40%: 7 sub-phases (2.0 → 2.7), ~40 tasks, ~7 weeks at Phase 1's pace.

---

## Audience

- **Primary user:** Sheik. Phase 2 success means his daily Pulse use expands from money-only to money + tasks, with voice latency improvements he can perceive and FX conversion that handles his occasional non-INR entries cleanly.
- **Secondary user:** the open-source community evaluating Pulse as an "AI-native life-OS" reference. Phase 2 shows the pattern repeats — the second Big Four domain integrates cleanly via the same primitives (entity_kind + Router + agent + chip + tab), proving the architecture scales.

Personal daily use is still the success metric.

---

## Problem statement

Phase 1 made Pulse useful for money. Three real pain points emerged from daily use that Phase 2 addresses:

1. **Money is only one domain.** Sheik also has TODOs that currently live elsewhere (mental, sticky notes, etc). Without a tasks domain, Pulse only captures half his daily voice-loggable life. The Big Four were Money > Tasks > Learning > Notes from the original spec; tasks is the natural next.
2. **The 2-4s voice spinner feels longer than it is.** A single spinner during the full Whisper → Router → money_agent round-trip gives no progress feedback. Users (Sheik) wonder if anything is happening. Cheap perceived-latency win.
3. **Single-currency dashboard ignores the entries that aren't ₹.** Phase 1 stores per-entry currency (9 supported) but MoneyCard hardcodes ₹. A $5 coffee entry doesn't show up in the headline at all — it's invisible to the dashboard. Sheik travels occasionally; this matters.

A fourth carry-over: `query_money` was deferred from Phase 1 explicitly, and the daily question "how much did I spend on X" is the most natural way to use voice (a read interaction in addition to the write interactions).

Phase 2 is also the **first phase where Pulse's architecture pattern is reused across domains**. If the patterns hold (and the build feels Phase-1-paced), the case for the remaining two Big Four domains (Learning + Notes) in Phase 3+ is much stronger.

---

## Goals (Phase 2)

1. **Tasks domain**: voice + text creation of one-shot tasks with title + due_at + priority. Same chip pattern, same sync. Tap-to-toggle completion.
2. **Tab bar shell**: bottom-fixed on mobile, top-positioned on desktop. URL-stateful (`?tab=`). Scales to 4 tabs for future domains.
3. **task_agent (Llama 70B)**: extracts title + due_at (TZ-aware) + priority (cued from utterance). ~30 adversarial fixtures.
4. **query_money agent (Llama 70B)**: read-only agent that returns a structured query plan; client executes against Dexie. Phase 2 scope: "total" queries only ("how much did I spend last week"). Answer card in the chip slot.
5. **Multi-currency FX**: daily ECB rates cached in a `fx_rates` D1 table via a new 03:00 UTC cron. MoneyCard sums non-primary entries via cross-rate-through-EUR conversion; footnote discloses rate date.
6. **Per-user TZ**: `user_prefs.tz` (IANA string). All date display sites use it. Voice agents inject it into the system prompt so "tomorrow at 3pm" resolves to local time.
7. **Voice SSE streaming**: `/api/voice` returns event-stream with 4 step events (transcribing / transcript / parsing / payload). Client cycles through 4 status states with a brief transcript flash.
8. **`scripts/eval-agents.ts` extended**: real-Groq evaluation covers task_agent (~30 fixtures) and query_money (~20 fixtures) alongside Phase 1's money_agent (50).
9. **Phase 1 invariants hold**: zero regressions in money/recurring/category sync; existing Phase 0/1 tests continue passing.

## Non-goals (Phase 2)

- **Recurring tasks** (cron-fired or repeat-on-completion): both deferred to Phase 3.
- **Task tags, projects, sub-tasks, descriptions**: defer.
- **query_money by-category / delta / list queries**: only "total" in Phase 2.
- **query_task agent**: no read-only agent for tasks in Phase 2. Phase 3 adds it alongside the insight engine.
- **Push notifications for due tasks**: Phase 3.
- **Insight engine + weekly retros**: Phase 3.
- **Receipt photo parsing (Llama 3.2 Vision)**: Phase 3.
- **Multi-primary currency** (one for personal, one for travel): Phase 3.
- **Manual FX rate override UI** (for currencies ECB doesn't publish): Phase 3 if ever needed.
- **Cross-tab voice-queue race fix** (still open from Phase 1's known-issues): Phase 3.
- **Learning + Notes domains**: Phase 3+, the last two of the Big Four.
- **Calendar integration / external task source ingestion**: out of scope indefinitely (Pulse stays voice-first / manual; no external feed integrations in Big Four).

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│                       DEVICE (PWA)                            │
│                                                               │
│  UI — Tab bar shell (NEW in Phase 2)                          │
│    Mobile:  [shared input] + [tab content] + [bottom nav]    │
│    Desktop: [shared input] + [top nav] + [tab content + side]│
│  Tabs (Phase 2): Money · Tasks                                │
│                                                               │
│  Voice + text input:                                          │
│    Same MediaRecorder + form path as Phase 1                  │
│    /api/voice now SSE-streamed (4 step events)                │
│    /api/agent still JSON (typed text — no Whisper to stream)  │
│    Router classifies into 5 intents:                          │
│      log_money | log_task | query_money | query_task | chat  │
│    log_task → task_agent (Llama 70B) → ChipDraft (task shape) │
│    query_money → query_money_agent → query plan → executed   │
│                  client-side against Dexie → answer card     │
│                                                               │
│  Local store (Dexie v3) — NEW tables this phase:              │
│    tasks · fx_rates (client cache)                            │
│    (user_prefs is server-only: not in Dexie)                  │
│                                                               │
│  Reads + display:                                             │
│    All dates formatted via user_prefs.tz                      │
│    MoneyCard / MoneyList convert via cross-rate-through-EUR   │
│      from fx_rates; footnote rate-date when ≥2 currencies    │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS
                             ▼
┌──────────────────────────────────────────────────────────────┐
│            CLOUDFLARE EDGE (Workers + OpenNext)               │
│                                                               │
│  Routes (additions in italics, unchanged routes in roman):    │
│   • POST /api/voice    multipart audio → SSE event-stream     │
│   • POST /api/agent    typed text → parsed payload (JSON)     │
│                        ALSO handles query_money intent now    │
│   • POST /api/sync     UNCHANGED from Phase 1                 │
│   • POST /api/cron/recur  UNCHANGED from Phase 1              │
│   • POST /api/cron/fx     NEW — ECB daily rates fetcher        │
│   • GET/PUT /api/user-prefs  NEW — primary currency + tz      │
│   • GET /api/fx/rates     NEW — recent rate lookup (cached)   │
│                                                               │
│  Cron triggers (wrangler.toml):                               │
│   • 02:00 UTC daily — recur (Phase 1)                         │
│   • 03:00 UTC daily — fx (Phase 2; 1hr offset, no overlap)    │
└──────────┬──────────────────────────────────┬────────────────┘
           ▼                                  ▼
┌─────────────────────────────┐    ┌──────────────────────────┐
│   D1 (SQLite)                │    │   Groq API (free tier)   │
│   NEW Phase 2 tables:         │    │   • whisper-large-v3-turbo│
│   • tasks                     │    │   • llama-3.1-8b   (router│
│   • fx_rates                  │    │       — extended 5-intent)│
│   • user_prefs                │    │   • llama-3.1-70b        │
│                               │    │       (money + task +    │
│   UNCHANGED from Phase 0/1:   │    │        query_money)      │
│   user, session, account,     │    └──────────────────────────┘
│   verification, devices,      │
│   op_log, widgets, categories,│
│   recurring_rules, money_entries
└─────────────────────────────┘
                             ┌──────────────────────────┐
                             │   ECB euro reference rates│
                             │   eurofxref-daily.xml     │
                             │   (free, stable since 2002│
                             │    ~30 currencies vs EUR) │
                             └──────────────────────────┘
```

**Key properties:**

- **All Phase 1 invariants hold.** Op-log path unchanged. HLC + per-field LWW unchanged. /api/sync route extends via the same materializer pattern (added in 1.0); just one more case in the switch.
- **Tab bar is the only new UI shell pattern.** Voice/text input stays single-surface; tab content varies by route intent.
- **Read-only agent is the only new agent pattern.** query_money returns a query plan; client executes. Future query_task / query_learning will reuse this shape.
- **FX is reference data, not user data.** `fx_rates` is server-canonical (`/api/cron/fx` writes) and client-cached for read performance. NOT in the op-log.
- **`user_prefs` is server-canonical, single-row metadata.** Not in op-log (one row per user; no merge semantics needed beyond last-write-wins from the user's most-recent device, which the simple GET/PUT pattern handles trivially).

---

## Data model + schema additions

Migration: `migrations/0003_phase_2_tasks.sql`. Dexie schema version bumped to v3.

### tasks

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT    PRIMARY KEY NOT NULL,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  due_at        TEXT,                                                       -- ISO 8601, nullable
  priority      TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  completed_at  TEXT,                                                       -- ISO 8601; null = open
  source        TEXT    NOT NULL CHECK (source IN ('voice', 'manual')),
  raw_input     TEXT,
  field_hlcs    TEXT    NOT NULL,
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_open
  ON tasks(user_id, due_at)
  WHERE completed_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_completed
  ON tasks(user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL AND deleted_at IS NULL;
```

`completed_at` is an ISO timestamp (not a boolean) — gives a soft-complete + completion history without separate audit columns. Toggling completion is an `op_type: 'update'` on this field; per-field HLC handles concurrent-device LWW.

### fx_rates

```sql
CREATE TABLE IF NOT EXISTS fx_rates (
  date    TEXT    NOT NULL,                       -- 'YYYY-MM-DD' (ECB UTC business day)
  base    TEXT    NOT NULL,                       -- always 'EUR' from ECB
  target  TEXT    NOT NULL,                       -- 'USD', 'INR', 'JPY', etc.
  rate    REAL    NOT NULL,                       -- 1 EUR = `rate` units of target
  PRIMARY KEY (date, base, target)
);

CREATE INDEX IF NOT EXISTS idx_fx_target_date ON fx_rates(target, date DESC);
```

ECB publishes ~30 currencies daily against EUR; every other pair is computed as a cross-rate via EUR at read time. ECB doesn't publish weekends/holidays; the conversion logic finds the most-recent rate ≤ requested-date.

### user_prefs

```sql
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id           TEXT    PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  primary_currency  TEXT    NOT NULL DEFAULT 'INR',
  tz                TEXT    NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at        TEXT    NOT NULL
);
```

Single row per user. Created lazily on first settings save. NOT in op-log — single-row converged metadata with last-write-wins handled by the GET/PUT route.

### Op type extension

```ts
export const ENTITY_KINDS = [
  'widget',
  'money', 'recurring', 'category',
  'task',                                    // NEW Phase 2
  'project', 'learning', 'note',            // Phase 3+
  'budget', 'insight',                      // Phase 3+
] as const
```

Per-kind Zod payload schemas live in `src/lib/op-schemas/{money,recurring,category,task}.ts`. `applyOp` in `src/lib/op-log.ts` looks up the schema by `op.entity_kind` (unchanged dispatcher), then routes to the right table materializer.

### Dexie schema (v3)

```ts
this.version(2).stores({ /* unchanged from Phase 1 */ })
this.version(3).stores({
  tasks:     'id, user_id, due_at, completed_at, [user_id+due_at], [user_id+completed_at]',
  fx_rates:  '[date+target], target',
})
```

Compound indexes match the most-common dashboard queries.

### Op payload schemas (`src/lib/op-schemas/task.ts`)

```ts
export const TaskPayloadSchema = z.object({
  title:        z.string().min(1).max(200),
  due_at:       z.string().datetime().nullable().optional(),
  priority:     z.enum(['low', 'medium', 'high']).default('medium'),
  completed_at: z.string().datetime().nullable().optional(),
  source:       z.enum(['voice', 'manual']),
  raw_input:    z.string().nullable().optional(),
})
```

---

## Agent topology — extensions

### Router (Llama 3.1 8B, JSON mode) — extended

Five intents now: `log_money | log_task | query_money | query_task | chat`. `query_task` is a stub in Phase 2 (Router classifies it, but the chip surfaces "Task queries land in Phase 3" — no agent dispatch).

Few-shot examples grow from 15 to ~25 (5 examples per new intent). Latency target unchanged: ~200ms.

### task_agent (Llama 3.1 70B, JSON mode) — NEW

Module: `src/lib/agents/task-agent.ts`.

Extracts:
```ts
{
  title:    string                          // ≤6 words, the action
  due_at:   string | null                   // ISO 8601 UTC, parsed from relative cues
  priority: 'low' | 'medium' | 'high'       // cued or default 'medium'
}
```

System prompt injects: `nowIso`, `userTz` (so "tomorrow at 3pm" resolves to the user's local time, returned as ISO UTC), and a small priority-cues table.

### query_money_agent (Llama 3.1 70B, JSON mode) — NEW

Module: `src/lib/agents/query-money-agent.ts`.

Returns a **query plan** (not a result):
```ts
{
  direction:   'out' | 'in'                 // 'spent' vs 'earned'
  category_name: string | null              // exact match from active categories or null
  period: {
    from:  string                           // ISO 8601 UTC
    to:    string                           // ISO 8601 UTC (exclusive)
    label: string                           // "last week" / "this month"
  }
}
```

Client takes the plan, calls `useMoneyEntries(userId, { from, to })`, filters by direction + optional category, sums `amount`, renders the answer card.

**Why agent-returns-plan, client-executes:** the agent has no DB access; the plan is portable, auditable in the chip, and reuses the existing client-side Dexie query path.

### Per-kind agent isolation

Each agent (money, task, query_money) is independently testable with a fake `llm-client` returning canned responses (Phase 1's pattern continues). `scripts/eval-agents.ts` extends to run all three fixture sets against real Groq.

### Adversarial fixture sets

| Agent | Cases | Buckets |
|---|---|---|
| money_agent (Phase 1) | 50 | happy / currency / amount / direction / date / category / failure |
| task_agent (Phase 2 NEW) | ~30 | happy (8) / priority cues (6) / date parsing (8) / no-due-date (3) / failures (5) |
| query_money (Phase 2 NEW) | ~20 | happy (8) / direction inference (4) / period parsing (5) / category disambiguation (3) |

---

## Voice path — SSE-streamed

`/api/voice` rewrites from JSON-once response to `text/event-stream`:

```
SERVER emits sequentially:
  data: {"step":"transcribing"}\n\n             ← immediately
  data: {"step":"transcript","text":"..."}\n\n  ← when Whisper returns
  data: {"step":"parsing"}\n\n                  ← immediately after
  data: {"step":"payload","intent":"...","payload":{...},"transcript":"..."}\n\n
  // OR on error:
  data: {"step":"error","message":"..."}\n\n
```

Client uses fetch + manual SSE parsing (EventSource can't POST a body for the multipart audio). The shared parser is `src/lib/voice-sse.ts` (extracted from VoiceRecorder so the offline queue drain reuses it).

UI cycles through 4 states:
- `'transcribing'` → "Listening to your voice…"
- `'transcript'` → "I heard: 'spent 80 on chai'" (~500ms flash before parsing kicks in)
- `'parsing'` → "Understanding…"
- `'payload'` → chip renders; recorder returns to idle

**Wall-clock latency unchanged** (still median ≤3s, p95 ≤6s — Phase 1's target). The improvement is perceived: progress visible at each step.

`/api/agent` (typed text) stays JSON. No Whisper means ~700-1500ms total work; SSE for ~1s is overkill.

---

## Multi-currency FX

### `/api/cron/fx` (daily 03:00 UTC)

Mirrors `/api/cron/recur`'s pattern: same `isAuthorizedCron` bearer-token check (extending the existing `CRON_SECRET`), same `wrangler.toml` cron-trigger config. Fetches `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, parses the XML (`parseEcbXml(xml) → { date, rates: { USD: 1.08, INR: 89.5, … } }`), upserts one `fx_rates` row per target.

### Cross-rate conversion (`src/lib/fx.ts`)

```ts
export async function convertToPrimary(
  db: Kysely<DB>,
  amount: number,         // smallest unit in `currency`
  currency: string,
  primary: string,
  occurredAt: string,
): Promise<{ amount: number; rateDate: string } | null>
```

- If `currency === primary` → identity (no conversion).
- Else: look up most-recent `EUR→currency` and `EUR→primary` rates on/before `occurredAt`'s date.
- `eurAmount = amount / eurToCurrency; primaryAmount = round(eurAmount * eurToPrimary)`.
- Minor-unit precision: JPY has no minor unit (rate is per-JPY, not per-100-sen). Helper `minorUnitDigits(currency)` returns `0` for JPY, `2` for everything else; conversion math respects this.
- Returns `null` if any required rate is missing (handled gracefully by MoneyCard: footnote "FX rates not yet loaded — non-primary entries excluded").

### Display

- **MoneyCard headline**: sum across all currencies in the period, converted to primary at each entry's `occurred_at` date's rate. Footnote when ≥2 currencies present: "*Includes ₹X, $Y, €Z converted via ECB Jun 18*".
- **MoneyList rows**: each row shows its native amount in its own currency. The 4-character native rendering ("$5.00") is the primary visual; tap-to-reveal shows "≈ ₹420 at Jun 15 rate" as a tooltip-or-small-text underneath.
- **Conversion runs client-side** using rates fetched once per app mount via `GET /api/fx/rates?targets=USD,EUR,…&since=YYYY-MM-DD`. Rates cached in Dexie's `fx_rates` store; stale-while-revalidate on app open.

### Edge cases

| Edge case | Behavior |
|---|---|
| First deploy, no rates yet | `convertToPrimary` returns `null`; MoneyCard headline = primary-only sum; footnote announces "FX rates not yet loaded". Resolves within 24h on first cron fire. |
| Weekend / holiday (ECB doesn't publish) | Most-recent date ≤ requested-date is used; rateDate in footnote discloses the actual date used. |
| Currency ECB doesn't publish | All 9 Pulse-supported currencies (INR/USD/EUR/GBP/AED/SGD/JPY/AUD/CAD) are in ECB's daily feed. Future additions might require manual override — deferred to Phase 3. |
| ECB feed format change | Cron's retry-with-backoff (3 attempts at 30s/2min/10min) handles transients. Total failure → CF observability logs; Phase 3 alerting. |

---

## Per-user TZ

### Storage + UI

`user_prefs.tz` (IANA timezone string; default `Asia/Kolkata` for Sheik; on first sign-in, browser-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`). New `/settings/preferences` page exposes a TZ picker (autocomplete over a curated list of ~200 common IANA zones; full list deferred to Phase 3 if needed). Same page exposes the primary currency picker (Phase 2 ships these two settings together).

### Agent prompt injection

`task_agent` and `money_agent` system prompts both gain a `userTz` argument:

> The user's local timezone is `${userTz}`. When the user says "tomorrow at 3pm" or "this morning", interpret in their local time and return `occurred_at` / `due_at` as ISO 8601 (UTC). Example: user in Asia/Kolkata says "this morning at 9am" at 14:00 IST → return `'<today>T03:30:00.000Z'` (9am IST = 03:30 UTC).

The LLM does the TZ conversion. Client doesn't re-convert.

### Display sites updated

`src/lib/format.ts` exposes `formatLocalDate(iso, tz, opts)` (thin wrapper over `Intl.DateTimeFormat`). All sites that today render an ISO date for the user switch to this helper:

- MoneyList row (entry `occurred_at`)
- `/settings/recurring` (rule's `next_due_at`, anchor_at)
- MoneyCard period label tooltip
- ConfirmationChip's edit-mode datetime picker

### Cron unchanged

Recurring rules already store `next_due_at` in UTC (correctly, post the Phase 1.4 anchor-DOM-clamping fix). The Phase 2 TZ change is purely a display + input-interpretation concern. The 02:00 UTC cron continues firing globally; the user's perception of "the rule fires at my local time" is preserved because `next_due_at` was stored at the local time the user intended, converted to UTC at chip-confirm.

---

## Tab bar shell

### Component (`src/components/tab-bar.tsx`)

Mobile: bottom-fixed nav (thumb reach). Desktop: top-positioned horizontal nav. Same component, Tailwind responsive utilities. Tab content area below (or above on mobile, given the bottom-fixed nav).

```
Tabs (Phase 2): Money · Tasks
Tabs (Phase 3+): Money · Tasks · Learning · Notes
```

### URL state

Active tab in URL search param: `/app?tab=tasks`. Default (no param) = money. Deep-linking + refresh-stability.

### Shared input header

Voice + text input lives ONCE above the tab content. Auto-switches active tab on chip confirm based on Router intent:
- `log_money` → switch to / stay on Money tab; scroll new entry into view in MoneyList
- `log_task` → switch to / stay on Tasks tab; scroll new entry into view in TaskList

If the user was on the OTHER tab when confirming, a small toast appears: "↗ Task added — switched to Tasks. Undo?" Auto-dismiss 3s.

### Active-tab badge

Each tab shows a small badge:
- **Money**: subtle dot if today's entries include any not-yet-seen on this device session
- **Tasks**: `(N)` counter where N = open + overdue tasks

Badges are pure render-time computation off `useLiveQuery` results — no new persistence.

---

## Build phases within Phase 2 (~7 weeks)

| Sub-phase | Weeks | Deliverables | "Done" looks like |
|---|---|---|---|
| **2.0 Schema + types** | 1 | `migrations/0003_phase_2_tasks.sql`; Kysely types; Dexie v3 bump; Zod for `task`; applyLocalOp + materializeRow_LWW extended; `/api/user-prefs` GET/PUT route | 180 → ~210 tests; typecheck + lint clean; no UI changes |
| **2.1 task_agent + manual task entry** | 1.5 | task_agent prompt + agent function; ~30 fixtures; `/api/agent` extended for `log_task` intent; Router prompt updated (4 intents); Tasks render below MoneyList temporarily | Typed "remind me to call mom tomorrow at 3pm" → chip → confirm → task lands below MoneyList; round-trips phone↔desktop |
| **2.2 Tab bar + Tasks UI** | 2 | `<TabBar>`; URL-state hook; `/app` rewrite; `TaskList` with tap-to-toggle + strikethrough; `TaskFilter` pill; `TaskSummary` sidebar; auto-switch on confirm | Bottom tab bar on mobile, top on desktop; both tabs independently functional; chip's confirm auto-switches |
| **2.3 Per-user TZ + user_prefs UI** | 3 | `/settings/preferences` page; TZ autocomplete picker; primary-currency picker; `format.ts` helper; all date display sites updated; agent prompts inject `userTz` + `defaultCurrency` | TZ change resolves voice "tomorrow at 3pm" correctly to user-local; recurring's `next_due_at` displays in user TZ |
| **2.4 Multi-currency FX** | 4 | `/api/cron/fx` route + ECB XML parser; wrangler.toml second cron trigger; `fx.ts` cross-rate helper; MoneyCard + MoneyList conversion rendering | Mixed-currency entries aggregate in MoneyCard with footnote; "1 lakh" voice still works; weekend stale-rate fallback works |
| **2.5 Voice SSE streaming** | 5 | `/api/voice` rewrite to ReadableStream + SSE; `VoiceRecorder` fetch-stream-parse; 4-state status line; `voice-sse.ts` shared helper; voice-queue refactor | Visible step-by-step feedback during voice round-trip; transcript flashes for ~500ms; offline queue still drains with SSE events ignored |
| **2.6 query_money agent** | 6 | query_money_agent + prompt + ~20 fixtures; `/api/agent` dispatcher for `query_money` intent; result-card variant of `ConfirmationChip`; Router prompt updates | "how much did I spend last week" → answer card with total + period label; auto-dismiss 30s; multi-currency uses Phase 2.4 FX |
| **2.7 E2E + retro** | 6.5 | Manual E2E verification; `scripts/eval-agents.ts` extended for task_agent + query_money; `docs/superpowers/notes/phase-2-retro.md`; Phase 3 prereqs note | All Phase 2 success criteria below verified; lint + typecheck + tests green; ship-gate audit clean |

**Total: ~40 tasks across 7 sub-phases. ~40% larger than Phase 1's 28 (reflecting 6 orthogonal pieces vs Phase 1's tighter "one domain + foundation" shape).**

Optional cuts if scope feels heavy mid-build:
- Drop 2.5 (voice SSE) — saves 4 tasks; UX win only, not capability. Voice latency wall-clock unchanged.
- Drop 2.6 (query_money) — saves 6 tasks; MoneyCard already shows current-month total + delta + top 3 categories.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| task_agent misparses relative dates ("end of next month", "Friday morning") | Medium | Low | Adversarial fixtures cover date parsing explicitly. Chip's `due_at` is editable. Real-Groq eval validates pre-merge. |
| Tap-to-complete misfires during scroll | Medium | Low | Pointer Events with small `move` threshold check; 250ms timing tolerance. Long-press for context menu is the alternate gesture. |
| Tab auto-switch disorients user | Low | Low | Small toast: "↗ Task added — switched to Tasks. Undo?" 3s auto-dismiss. |
| query_money returns from > to or invalid period | Medium | Medium | Zod refinement (`from < to`). Chip shows clear error + suggested phrasings. |
| query_money's category lookup fails on near-match | High | Low | Prompt explicitly says "return null if no exact match"; chip shows "All categories" when null. Phase 3 fuzzy-match. |
| ECB XML format changes or CDN goes down | Low | High | Retry-with-backoff on cron (3 attempts at 30s/2min/10min). Stale rates auto-extend (most-recent ≤ requested-date). Phase 3 alerting. |
| ECB doesn't publish a Pulse-supported currency | Low | Medium | All 9 are in ECB's daily feed. Future additions could need manual override — deferred. |
| FX cold start (first deploy, no rates yet) | High | Low | Conversion helper returns `null`; MoneyCard headline = primary-only + footnote "FX rates not yet loaded". Resolves within 24h. |
| Stale rates over long holidays (e.g., Christmas) | Medium | Low | Most-recent rate ≤ requested-date; footnote discloses actual date. 3-day stale worst case is fine for personal finance. |
| LLM TZ interpretation drift ("tomorrow at 3pm" parses to wrong UTC) | Medium | Medium | Fixtures cover TZ-crossing cases. Real-Groq eval validates. Chip's `due_at` editable as fallback. |
| CF Workers SSE response edge cases | Low | Medium | Test in `wrangler dev` first; on any path failure, fall back to JSON (single `step: 'payload'` event). |
| Voice queue offline drain breaks with SSE | Medium | Low | Shared helper `callVoiceApiStreaming(blob)` has `onEvents` callback; drain passes `() => {}` (ignores intermediate). |
| Cloudflare scheduled() handshake still unverified (Phase 1 carryforward) | Medium | High | Verify both crons (02:00 + 03:00 UTC) with `wrangler tail` after deploy. Shim-Worker fallback unchanged from Phase 1 plan. |
| Multi-cron rate-limit collisions | Low | Low | 02:00 + 03:00 — one hour apart; CF cron budget is 30s each; both routes finish well under. |
| Phase 0/1 regression as branches refactor | Low | High | All 180 baseline tests must pass at every sub-phase close. Sub-phase critic pattern continues. |
| Public branch's dependabot resurges as deps drift | Medium | Low | `pnpm-workspace.yaml` overrides pin minimums. `pnpm audit` is a sub-phase 2.7 retro check. |

**Heaviest residual risks:** (1) the CF scheduled() handshake is still unverified in production (Phase 1 carryforward); Phase 2 piles on a second cron. (2) LLM TZ interpretation is genuinely fiddly — fixtures + real-Groq eval are the line of defense.

---

## Success criteria

### Behavioral (Sheik's manual gate, over ≥7 days of real use)

- [ ] Voice "remind me to call mom tomorrow at 3pm" → confirmed → visible on second device within 10s, `due_at` parsed to correct UTC for user TZ
- [ ] Voice "urgent: file taxes today" → task with `priority='high'`, `due_at=today`; both devices reflect within 10s
- [ ] Tap any open task → instant strikethrough + sync within 10s; tap again to un-complete
- [ ] Filter pill toggles (Open / Completed / All) update without re-fetch
- [ ] Tab auto-switches: type "spent ₹80 on chai" on Tasks tab → confirm → tab switches to Money + entry appears
- [ ] Voice "how much did I spend last week" → answer card with correct total + period label; auto-dismisses
- [ ] TZ change in `/settings/preferences` → next voice "tomorrow at 3pm" resolves to new TZ-local
- [ ] $5 (USD) entry while primary = INR → MoneyCard headline shows total in ₹ with conversion footnote; MoneyList row shows native `$5.00`
- [ ] Voice SSE: tap mic → speak → stop → see "Listening… → I heard: '…' → Understanding… → chip" progressing
- [ ] 7 consecutive days of mixed voice entries (money + tasks) without missed parses

### Technical (verifiable at Phase 2 close)

- [ ] **≥280 tests passing in CI** (180 baseline + ~30 op-schema/sync + ~30 task_agent + ~20 query_money + ~10 fx + ~10 settings integration)
- [ ] task_agent adversarial set: ≥95% mock + ≥95% real-Groq pass rate
- [ ] query_money adversarial set: ≥95% mock + ≥90% real-Groq pass rate
- [ ] Voice round-trip latency: median ≤3s, p95 ≤6s (unchanged from Phase 1 target)
- [ ] FX cron fires daily at 03:00 UTC for ≥7 consecutive days; `wrangler tail` confirms
- [ ] Recurring cron continues firing daily; 0 regressions
- [ ] CI workflow green on `main`; deploy.yml D1 migration step succeeds with 0003
- [ ] No Phase 0/1 regressions — `pnpm test -- tests/{op-log,sync-server,sync-client,sync-integration,hlc,seed-categories,recurring,voice-queue}.test.ts` all green
- [ ] `pnpm audit` reports zero vulnerabilities
- [ ] Lint clean; typecheck clean

### Cross-phase invariants

- All `entity_kind` writes flow through op-log (tasks join money/recurring/category)
- `fx_rates` and `user_prefs` are explicit op-log exceptions, documented in inline comments
- Cron auth consistent across `/api/cron/recur` + `/api/cron/fx` (`CRON_SECRET` bearer)
- `ChipDraft` is generic enough to render either money or task fields
- TZ + currency from `user_prefs` consistently injected into every agent prompt that needs it

---

## Items deferred to Phase 3+

- Recurring tasks (cron-fired or repeat-on-completion)
- Tasks: tags / projects / sub-tasks / descriptions
- query_money: by-category / delta / list query types
- query_task agent
- Push notifications for due tasks
- Insight engine + weekly retros
- Receipt photo parsing (Llama 3.2 Vision)
- Multi-primary currency (personal vs travel)
- Manual FX rate override UI
- Cross-tab voice-queue race fix (carry-over from Phase 1)
- Learning + Notes domains (the remaining Big Four)

---

## References

- Phase 1 spec: `docs/superpowers/specs/2026-06-16-pulse-phase-1-voice-money-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-06-18-pulse-phase-1-voice-money.md`
- Phase 1 retro template: `docs/superpowers/notes/phase-1-retro.md`
- Cloudflare cron triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Cloudflare Workers SSE: <https://developers.cloudflare.com/workers/runtime-apis/streams/>
- Groq API + models: <https://console.groq.com/docs/>
- ECB euro reference rates: <https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html>
- IANA timezone database: <https://www.iana.org/time-zones>
- date-fns (already a dep): <https://date-fns.org/>
- Kysely (existing): <https://kysely.dev/>

---

## Sign-off

This spec is approved for handoff to the writing-plans skill when Sheik signs off.
