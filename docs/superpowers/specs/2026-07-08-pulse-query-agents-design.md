# Pulse Query Agents — Design Spec

**Date:** 2026-07-08
**Status:** Approved direction (4 domains: query_money v2 + query_task + query_learning + query_notes; text path; read-only). Ready for implementation plan.
**Scope:** Make Pulse conversational over its own data — natural-language questions answered across money, tasks, learning, and notes. Extends the existing `query_money` pattern. **Read-only**: no new `entity_kind`, no Dexie store, no D1 migration, no op-log/sync/`applyLocalOp`/materialize changes.

## Goal

Ask "how much did I spend on food last month?", "what's overdue?", "what did I learn about Rust?", "find my note about the wifi password" — and get an answer computed from local data. The agent turns the question into a structured **plan**; the client executes the plan over Dexie and renders an answer. The agent never sees the data (privacy + offline-friendly), consistent with the shipped `query_money`.

## Architecture (reused — the shipped `query_money` pattern)

Text input → `/api/agent` runs `routeIntent` → for a `query_*` intent, calls the domain **query agent** (`gpt-oss-120b`, Zod-clamped) which returns a **plan** (structured query params, NOT data) → the route returns `{ intent, payload: <plan> }` → the client stores it in `queryPlan` state → an answer component **executes the plan over Dexie** (via the existing hooks) and renders. Dismiss mirrors the current 30s auto-dismiss card.

`QueryPlan` becomes a **discriminated union** (by `kind`): `QueryMoneyPlan | QueryTaskPlan | QueryLearningPlan | QueryNotesPlan`, defined in a shared module (`src/lib/query-plans.ts`). The `/app` query slot renders by `kind`.

## Per-domain plans, execution, and answers

### `query_money` v2 (extend the existing agent + `QueryAnswerCard`)
Plan gains `mode: 'total' | 'breakdown' | 'delta' | 'series'` (default `total`), keeping `direction`, `category_name`, `period`; `series` adds `bucket: 'day' | 'week' | 'month'`.
- **total** — existing single-figure sum (unchanged).
- **breakdown** — group the period's entries (by `direction`) per category → `[{ category, amount }]` sorted desc, rendered as rows with proportional bars.
- **delta** — total for `period` vs the immediately-preceding equal-length period → `{ current, previous, deltaPct }` with an up/down indicator.
- **series** — bucket the period by `bucket` → `[{ label, amount }]` → a sparkline (reuse the MoneyCard sparkline style).
All computed client-side over `useMoneyEntries` with the existing FX conversion. The disabled **"Show entries"** button is wired to list the matching entries.

### `query_task` (new agent; intent already in `INTENTS`)
Plan: `{ kind:'query_task', status: 'open'|'overdue'|'done'|'all', period: Period | null }`. Execution: filter `useTasks()` by status (overdue = open + `due_at < now`) and optional period → render a filtered `TaskList` + a count header.

### `query_learning` (new intent + agent)
Plan: `{ kind:'query_learning', search: string | null, tags: string[], period: Period | null }`. Execution: filter `useLearnings()` by case-insensitive substring over `text` (+ tags, + period) → render a filtered `LearningList` + count.

### `query_notes` (new intent + agent)
Plan: `{ kind:'query_notes', search: string | null, tags: string[], period: Period | null }`. Execution: filter `useNotes()` via the existing `searchNotes` (+ tags, + period) → render a filtered `NotesList` + count.

`Period = { from: string; to: string; label: string }` (shared, as today).

## Router changes (the build's risk point → adversarial verify)

- Add `query_learning`, `query_notes` to `INTENTS` (query_money, query_task already present).
- Router prompt: add query examples per domain + disambiguation. **Revise existing rules that now conflict:** the tie-breaker added during the Learning build ("a question about past learnings ('what did I learn') → chat") must now route to **`query_learning`**; "find my note about X" / "search my notes for Y" → **`query_notes`** (not `log_note`); keep "I learned X" → `log_learning`, "note that X" → `log_note`. Because this **changes existing routing behavior**, the build runs the same 2-lens adversarial router verify (query-vs-log-vs-chat collisions across all domains) + a regression test asserting the log_* and money/task query intents still classify correctly.

## UI

- **Money answer:** `QueryAnswerCard` extended to branch on `mode` (total = today's card; breakdown = category rows + bars; delta = current/previous + %; series = sparkline). Glass, mono figures, `--accent-2`.
- **Task/Learning/Notes answers:** a small `<QueryListAnswer>` wrapper (header describing the question + count + dismiss) that renders the existing `TaskList` / `LearningList` / `NotesList` fed the plan-filtered rows. Reuses those components (no new list UI).
- **`/app` query slot:** the existing `queryPlan` state generalizes to the union; render `QueryAnswerCard` for `kind==='query_money'`, else `QueryListAnswer` with the right list. Preserve the current input-bar disable-while-answer-open behavior.

## Global constraints

- Stack unchanged. **Additive + read-only** — NO new entity_kind / Dexie store / migration / op-log / sync-client / materialize changes. No new dependencies. Dark glassmorphism conventions (glass, `--accent-2`, `font-mono`, lucide, focus-visible, ≥44px, `role`/aria).
- Template: the shipped `query-money-agent.ts` + `query-answer-card.tsx` + the four domains' hooks/list components. Blueprint (domain patterns): `docs/superpowers/notes/2026-07-08-pulse-domain-blueprint.json`.
- Op-schemas convention (no `.strict()`) doesn't apply here (query responses are agent-output schemas — those DO use `.strict()` like the existing `query-money-response` / agent response schemas; mirror the existing query-money-response schema style).
- Gate every task: `pnpm typecheck` + `pnpm lint` + `pnpm test` (baseline 531, grows; run `pnpm test` UN-CHAINED) + **`pnpm build`**. Git identity `sdsheikahamed@gmail.com`. Branch `feature/query`.

## Non-goals (YAGNI)

- **No voice queries** — queries are text-path (`/api/agent`) only, matching today's `query_money`; making `/api/voice` produce query plans is a documented follow-up.
- No cross-domain queries ("what did I do last week" spanning all four).
- No charts beyond the simple sparkline; no saved/pinned queries; no multi-turn follow-ups; no export.
- No new server-side aggregation — all execution is client-side over Dexie.

## Testing & verification

- **Pure execution functions (unit-tested, like `searchNotes`):** money `breakdown`/`delta`/`series` aggregation; task status+period filter; learning/notes search+tag+period filter. Each a pure `(rows, plan) → result` function with edge cases (empty rows, no matches, multi-currency for money, period boundaries).
- **Query agents (Groq-mocked):** each `parse*Query` returns a valid plan for representative questions; malformed model output is clamped/rejected.
- **Router:** regression (all existing intents still classify) + the adversarial query-vs-log-vs-chat verify.
- **Gate:** typecheck + lint + test (grows) + `pnpm build`.
- **Manual:** on the deployed PWA, type a question per domain → correct answer/list; dismiss; a log utterance still logs (no query misroute).

## Risks & mitigations

- **Router disambiguation regression** (query_learning/query_notes revise existing "what did I learn → chat" + "note about X" rules) → adversarial 2-lens verify + regression test; the answer card is dismissible so a misroute is low-harm.
- **Aggregation correctness** (money breakdown/delta/series, esp. multi-currency + period-boundary math) → pure unit-tested functions with edge cases; reuse the proven FX conversion from the existing card.
- **Scope creep across 4 domains** → each domain's query is a small, independent slice sharing the plan→execute→answer pattern; build incrementally, one domain per task.
- **Empty/degenerate answers** ("no entries match") → every answer has an explicit empty state.
