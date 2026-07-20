# Pulse Query Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Natural-language "ask your data" across all four domains — `query_money` v2 (total/breakdown/delta/series) + new `query_task`, `query_learning`, `query_notes` — reusing the shipped NL→plan→client-execute→answer pattern.

**Architecture:** The router classifies to a `query_*` intent; a domain query agent (`gpt-oss-120b`, Zod-clamped) returns a structured **plan**; the client executes the plan over local Dexie data (via existing hooks) and renders an answer. **Read-only** — no new entity_kind, Dexie store, migration, op-log, sync-client, or materialize changes.

**Tech Stack:** Next 16 + React 19 + Tailwind 4 + Dexie v4 + Groq (`gpt-oss-120b` query agents, `gpt-oss-20b` router) + Vitest.

## Global Constraints

- **Additive + READ-ONLY.** No new entity_kind / Dexie store / D1 migration / op-log / `sync-client.ts` / `materialize.ts` / `entity-fields.ts` changes. No new dependencies.
- Query **agent-response** schemas mirror the existing `query-money-response.ts` (Zod, `.refine` for period ordering — NOT the op-schema no-`.strict()` rule; those are op payloads, this is agent output).
- Text path only (`/api/agent`); do NOT add query handling to `/api/voice` (documented non-goal). Queries via `gpt-oss-120b` (mirror `parseMoneyQuery`).
- Dark glassmorphism (glass, `--accent-2`, `font-mono`, lucide, focus-visible, ≥44px, `role`/aria). Every answer has an empty state.
- Template: the shipped `src/lib/agents/query-money-agent.ts` + `schemas/query-money-response.ts` + `prompts/query-money-agent.ts` + `src/components/query-answer-card.tsx` + the four domains' hooks (`use-money-entries`, `use-tasks`, `use-learnings`, `use-notes`) and list components (`TaskList`, `LearningList`, `NotesList`).
- Gate every task: `pnpm typecheck` + `pnpm lint` + `pnpm test` (baseline **531**, grows; run `pnpm test` **UN-CHAINED**) + **`pnpm build`**. Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Branch `feature/query` (spec committed `e8a0e60`).

## Canonical Interfaces

**`src/lib/query-plans.ts`** (new — the shared discriminated union; move `QueryPlan` here out of `query-answer-card.tsx`):
```ts
export type Period = { from: string; to: string; label: string }
export type QueryMoneyPlan = { kind: 'query_money'; mode: 'total' | 'breakdown' | 'delta' | 'series'; direction: 'out' | 'in'; category_name: string | null; period: Period; bucket?: 'day' | 'week' | 'month' }
export type QueryTaskPlan = { kind: 'query_task'; status: 'open' | 'overdue' | 'done' | 'all'; period: Period | null }
export type QueryLearningPlan = { kind: 'query_learning'; search: string | null; tags: string[]; period: Period | null }
export type QueryNotesPlan = { kind: 'query_notes'; search: string | null; tags: string[]; period: Period | null }
export type QueryPlan = QueryMoneyPlan | QueryTaskPlan | QueryLearningPlan | QueryNotesPlan
```
**Pure execution fns** (each `(rows, plan) → result`, unit-tested): `src/lib/query-money-exec.ts` (`computeMoneyBreakdown`/`Delta`/`Series` — total stays in the card), `src/lib/query-task-exec.ts` (`filterTasksForQuery`), `src/lib/query-learning-exec.ts` (`filterLearningsForQuery`), `src/lib/query-notes-exec.ts` (`filterNotesForQuery`).
**Agents**: `parseTaskQuery`/`parseLearningQuery`/`parseNotesQuery` (mirror `parseMoneyQuery`) + response schemas. **UI**: `<QueryListAnswer>` (glass wrapper: title + count + 30s auto-dismiss + a list slot). Router intents `query_learning`, `query_notes` added.

---

### Task 1: Shared query-plan union + `<QueryListAnswer>` + router intents & disambiguation  *(risk point)*

**Files:** Create `src/lib/query-plans.ts`, `src/components/query-list-answer.tsx`; Modify `src/components/query-answer-card.tsx` (import `QueryMoneyPlan` from the new module), `src/app/app/page.tsx` (import `QueryPlan` from the new module), `src/lib/agents/schemas/router-response.ts` (INTENTS), `src/lib/agents/prompts/router.ts` (query examples + revised disambiguation), `tests/agents/router.test.ts`.

- [ ] **Step 1: Create `src/lib/query-plans.ts`** — the Canonical Interfaces union. `QueryMoneyPlan` keeps today's fields + adds `mode` (default handled by the schema) + optional `bucket`.
- [ ] **Step 2: Move `QueryPlan` type** out of `query-answer-card.tsx` into `query-plans.ts`; `query-answer-card.tsx` imports `QueryMoneyPlan` (its `plan` prop becomes `QueryMoneyPlan`); `app/page.tsx` imports `QueryPlan` from `@/lib/query-plans`. The app's existing `if (plan.kind === 'query_money')` branch is unchanged (other kinds not yet handled — added per-domain later; non-exhaustive check compiles).
- [ ] **Step 3: `<QueryListAnswer>`** — `src/components/query-list-answer.tsx`: props `{ title: string; count: number; onDismiss: () => void; children: React.ReactNode }`; glass card, header (title + `count` mono) + dismiss button (focus-visible, ≥44px) + `children` (the list) + a 30s auto-dismiss `useEffect` (mirror `QueryAnswerCard`). Empty state when `count === 0` ("Nothing matches").
- [ ] **Step 4: Router intents** — `router-response.ts`: `INTENTS` += `'query_learning'`, `'query_notes'` (query_money, query_task already present).
- [ ] **Step 5: Router prompt** — `prompts/router.ts`: add query examples ("how much did I spend on food last week" → query_money [exists], "what's overdue" → query_task [exists], "what did I learn about Rust" → query_learning, "find my note about the wifi password" → query_notes). **Revise conflicting tie-breakers:** the existing "a question about past learnings ('what did I learn') → chat" now → **query_learning**; add "'find/search my notes for X' / 'what's my note about X' → query_notes (not log_note)"; keep "I learned X"→log_learning, "note that X"→log_note. Do not weaken money/task examples.
- [ ] **Step 6: Router regression test** — `tests/agents/router.test.ts`: assert the 4 query intents classify AND all log_* + chat still classify correctly (mock the client per the existing suite).
- [ ] **Step 7: Gate** (typecheck/lint/build; `pnpm test` un-chained). Commit: `feat(query): shared query-plan union + QueryListAnswer + router query intents`.

*(Controller runs the adversarial 2-lens router verify after this task.)*

---

### Task 2: `query_money` v2 (total / breakdown / delta / series)

**Files:** Modify `src/lib/agents/schemas/query-money-response.ts`, `src/lib/agents/prompts/query-money-agent.ts`, `src/app/api/agent/route.ts` (pass `mode`/`bucket` into the returned plan), `src/components/query-answer-card.tsx`; Create `src/lib/query-money-exec.ts`, `tests/lib/query-money-exec.test.ts`.

- [ ] **Step 1: Extend the schema** — `query-money-response.ts`: add `mode: z.enum(['total','breakdown','delta','series']).default('total')` and `bucket: z.enum(['day','week','month']).optional()`; keep `direction`/`category_name`/`period` + the `.refine`.
- [ ] **Step 2: Extend the prompt** — `prompts/query-money-agent.ts`: instruct the agent to set `mode` (breakdown for "what did I spend on / by category", delta for "more/less than last month / vs last period", series for "trend / over time"), and `bucket` for series. Examples for each mode.
- [ ] **Step 3: Pure execution fns (TDD)** — `tests/lib/query-money-exec.test.ts` first, then `src/lib/query-money-exec.ts`: `computeMoneyBreakdown(entries, {direction, period}) → [{ category_id|null, category_name, amount }]` sorted desc; `computeMoneyDelta(entries, plan) → { current, previous, deltaPct }` (previous = immediately-preceding equal-length window — the fn takes both windows' entries or computes from a superset; keep it pure — pass the needed entries in); `computeMoneySeries(entries, {period, bucket}) → [{ label, amount }]`. All operate on already-FX-normalized amounts (the card converts before calling, or the fn takes a converter — mirror the card's existing conversion; keep the fn pure by passing a `toPrimary(entry) → amount` mapper). Tests: empty, single category, multi-category sort, delta up/down/zero-prev, series bucketing + boundaries.
- [ ] **Step 4: `QueryAnswerCard` branches on `mode`** — total = today's figure; breakdown = category rows with proportional bars (`--accent-2`); delta = current vs previous + signed % with up/down; series = a sparkline (reuse the MoneyCard sparkline). Wire the previously-disabled **"Show entries"** to reveal the matching `MoneyList` rows for the plan.
- [ ] **Step 5: Route** — `/api/agent` query_money block: include `mode`/`bucket` from the agent response in the returned plan (it already spreads the response; confirm `mode`/`bucket` flow through).
- [ ] **Step 6: Gate + Commit** — `feat(query): money v2 — breakdown, delta, series answers`

---

### Task 3: `query_task`

**Files:** Create `src/lib/agents/query-task-agent.ts`, `src/lib/agents/prompts/query-task-agent.ts`, `src/lib/agents/schemas/query-task-response.ts`, `src/lib/query-task-exec.ts`, `tests/lib/query-task-exec.test.ts`, `tests/agents/query-task-agent.test.ts`; Modify `src/app/api/agent/route.ts`, `src/app/app/page.tsx`.

- [ ] **Step 1: Agent + schema + prompt** (mirror query-money): `parseTaskQuery({client,text,nowIso,userTz}) → QueryTaskResponse` = `{ status: 'open'|'overdue'|'done'|'all', period: {from,to,label} | null }`; prompt maps "what's due today"→{status:open, period:today}, "overdue"→{status:overdue}, "done this week"→{status:done, period:week}. Zod-clamped.
- [ ] **Step 2: Pure exec fn (TDD)** — `filterTasksForQuery(tasks: TaskRow[], plan: QueryTaskPlan, nowIso): TaskRow[]`: open = not done + not deleted; overdue = open + `due_at && due_at < nowIso`; done = completed; all = every live task; then optional period filter (on `due_at` or `created_at` — match how TaskList/TaskFilter scope). Tests: each status, overdue boundary, period filter, empty.
- [ ] **Step 3: Route** — `/api/agent`: add a `query_task` branch → `parseTaskQuery` → return `{ intent:'query_task', payload: { kind:'query_task', ...response } }` (mirror query_money).
- [ ] **Step 4: App render** — `app/page.tsx`: in the query-slot, when `queryPlan.kind === 'query_task'`, render `<QueryListAnswer title=… count=…>` wrapping a `<TaskList>` fed `filterTasksForQuery(useTasks(...), plan, now)`. Additive branch; AppPageInner/other logic untouched.
- [ ] **Step 5: Gate + Commit** — `feat(query): query_task — due/overdue/done answers`

---

### Task 4: `query_learning`

**Files:** Create `src/lib/agents/query-learning-agent.ts`, `prompts/query-learning-agent.ts`, `schemas/query-learning-response.ts`, `src/lib/query-learning-exec.ts`, `tests/lib/query-learning-exec.test.ts`, `tests/agents/query-learning-agent.test.ts`; Modify `src/app/api/agent/route.ts`, `src/app/app/page.tsx`.

- [ ] **Step 1: Agent + schema + prompt** — `parseLearningQuery(...) → { search: string|null, tags: string[], period: {from,to,label}|null }`; prompt: "what did I learn about Rust"→{search:'Rust'}, "learnings this week"→{period:week}, "learnings tagged X"→{tags:['X']}.
- [ ] **Step 2: Pure exec fn (TDD)** — `filterLearningsForQuery(rows: LearningRow[], plan, ...) → LearningRow[]`: case-insensitive substring of `search` over `text` (+ `attribution`), AND tag membership (any of `plan.tags`), AND optional period on `occurred_at`; empty search+tags+period → all. Tests: search match, tag filter, period, combined, empty→all, no-match→[].
- [ ] **Step 3: Route + App render** — `/api/agent` `query_learning` branch; `app/page.tsx` renders `<QueryListAnswer>` + `<LearningList>` fed the filtered rows.
- [ ] **Step 4: Gate + Commit** — `feat(query): query_learning — search/tag/period answers`

---

### Task 5: `query_notes`

**Files:** Create `src/lib/agents/query-notes-agent.ts`, `prompts/query-notes-agent.ts`, `schemas/query-notes-response.ts`, `src/lib/query-notes-exec.ts`, `tests/lib/query-notes-exec.test.ts`, `tests/agents/query-notes-agent.test.ts`; Modify `src/app/api/agent/route.ts`, `src/app/app/page.tsx`.

- [ ] **Step 1: Agent + schema + prompt** — `parseNotesQuery(...) → { search, tags, period }`; prompt: "find my note about wifi"→{search:'wifi'}, "notes tagged work"→{tags:['work']}.
- [ ] **Step 2: Pure exec fn (TDD)** — `filterNotesForQuery(rows: NoteRow[], plan, ...) → NoteRow[]`: reuse `searchNotes(rows, plan.search ?? '')` then AND tag membership + optional period on `occurred_at`. Tests mirror learning.
- [ ] **Step 3: Route + App render** — `/api/agent` `query_notes` branch; `app/page.tsx` renders `<QueryListAnswer>` + `<NotesList>` fed the filtered rows.
- [ ] **Step 4: Gate + Commit** — `feat(query): query_notes — search/tag/period answers`

---

### Task 6: Polish, accessibility & full-gate pass

- [ ] **Step 1:** a11y across the new query UIs (QueryAnswerCard modes, QueryListAnswer, the filtered lists in the query slot): focus-visible rings, aria-labels, ≥44px, AA contrast, empty states, mono figures/dates.
- [ ] **Step 2:** consistency — the money breakdown bars + delta indicator + sparkline read cleanly; each query answer has a clear header describing the question and a working dismiss; the input bar stays disabled while an answer is open (existing behavior, all kinds).
- [ ] **Step 3: Full gate** — typecheck/lint/build + `pnpm test` (un-chained), all green.
- [ ] **Step 4: Manual QA runbook** (report; human on deployed PWA): type one question per domain + per money mode ("how much on food last week", "what did I spend on by category last month", "am I spending more than last month", "spending trend", "what's overdue", "what did I learn about Rust", "find my note about wifi") → each returns a correct answer/list; dismiss works; a log utterance ("spent 80 on chai", "note that…", "I learned…") still LOGS (no query misroute).
- [ ] **Step 5: Commit** — `chore(query): polish + a11y pass`

---

## Self-Review

**Spec coverage:** money v2 (total/breakdown/delta/series) → Task 2; query_task → Task 3; query_learning → Task 4; query_notes → Task 5; shared union + `<QueryListAnswer>` + router intents + revised disambiguation + regression → Task 1; read-only (no sync/migration) → Global Constraints + no task touches sync-client/materialize/migrations/entity-fields; text-only (no voice) → Global Constraints; a11y + manual QA → Task 6. ✓ Non-goals (voice query, cross-domain, saved queries, charts beyond sparkline) — none introduced.

**Placeholder scan:** No TBD/TODO. Each exec fn is a concrete pure `(rows, plan) → result` with enumerated tests; "mirror <shipped file>" points at real files. Router disambiguation revisions are spelled out.

**Type consistency:** `QueryPlan` union (query-plans.ts) is the single source; `QueryAnswerCard` consumes `QueryMoneyPlan`, `QueryListAnswer` is plan-agnostic (title+count+children). Each `parse*Query` returns a response that the route wraps as `{ kind, ...response }` matching the union member. Exec fns take `(rows, plan)` with the matching plan member + return the domain's Row[] (fed to the existing list component). `INTENTS` gains query_learning/query_notes; the app query-slot switches on `plan.kind`. No sync/entity types touched (read-only).
