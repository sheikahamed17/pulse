# AI conversational assistant — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A chat thread (`/assistant`) that answers questions about the user's own data across money/tasks/learning/notes, with best-effort multi-turn context so follow-ups ("what about last month?") resolve. Read-only in v1.

**Architecture:** REUSE the existing agent pipeline. Each user message → `/api/agent` (router → per-domain query agent → a PLAN) → the CLIENT executes the PLAN locally over Dexie (existing execs + `QueryAnswerCard`/list-answer renderers) → rendered in the thread. **Privacy preserved: the model receives the question + category NAMES + recent prior questions — never raw entries** (data never leaves the device; the PLAN→client-exec model is unchanged). Multi-turn = an OPTIONAL `history` (recent user message strings) threaded to the router + query agents; additive + graceful (existing one-shot capture is untouched — it simply omits `history`).

## v1 scope + non-goals

- v1 = a `/assistant` chat page: ask data questions, get answers rendered inline (money via `QueryAnswerCard`; task/learning/notes via the existing list renderers); best-effort follow-up context from the last few user messages; a helpful fallback for chat/unknown; log-intent messages suggest opening capture (NOT auto-logged).
- **Read-only** — the assistant never mutates data in v1 (no logging/editing from chat). **Deferred:** voice in-thread, taking actions (create/edit entries), persisting the thread across reloads (v1 thread = in-memory/session state), cross-domain synthesis beyond a single query per message, streaming.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green. No `Date.now()` in render/useMemo.
- **Privacy invariant (do NOT break):** never send raw money/task/etc. entry data to `/api/agent`/Groq. The request carries only `text`, category NAMES (`categories`, as today), and `history` (recent user message STRINGS). Execution stays client-side over Dexie.
- Additive + backward-compatible: `history` is an OPTIONAL request field; the existing `/app` capture path must keep working unchanged (it omits `history`). The router/agent prompt changes must be ADDITIVE (a one-shot message with no history behaves exactly as before).
- Reuse: `routeIntent`/the query agents (`src/lib/agents/*`), the query execs (`src/lib/query-*-exec.ts`), `QueryAnswerCard` (`src/components/query-answer-card.tsx`), the list-answer wrappers (currently inline in `src/app/app/page.tsx` — extract in Task 3), `useCategories` (for the `categories` payload).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/assistant` 200, `/api/agent` unauth → 401. **Whole-branch opus review** (touches the shared agent route + extracts shared UI): confirm the privacy invariant holds (no raw data sent), existing `/app` capture + query flow is unchanged, history is optional/additive, and the extraction is behavior-preserving.

## Background (verified)

- `/api/agent` POST `{ text, categories }` → `routeIntent` → per-intent dispatch → `{ transcript, intent, confidence, payload }`. Query intents return a PLAN payload (`kind: 'query_money'|'query_task'|'query_learning'|'query_notes'`); `chat` + unknown → `payload: null`; log intents → a log payload. `INTENTS` in `schemas/router-response.ts`.
- `QueryAnswerCard({ userId, plan: QueryMoneyPlan, onDismiss, onResult })` runs the money execs over Dexie + renders (money). The task/learning/notes equivalents are inline functions `QueryTaskListAnswer`/`QueryLearningListAnswer`/`QueryNotesListAnswer` in `src/app/app/page.tsx` (wrap `QueryListAnswer` + the per-domain execs).
- `QueryPlan` union in `src/lib/query-plans.ts` (`query_money|query_task|query_learning|query_notes`).
- Router (`src/lib/agents/router.ts`) + prompts in `src/lib/agents/prompts/`. Query agents: `query-money-agent.ts` etc. (each takes `{ client, text, categories?, nowIso, userTz }`).

---

### Task 1: pure conversation history helper

**Files:** Create `src/lib/assistant.ts`, `src/lib/assistant.test.ts`

**Interfaces (Produces):**
- `type AssistantTurn = { id: string; role: 'user' | 'assistant'; text: string; intent?: string | null; payload?: unknown }`
- `buildAgentHistory(turns: AssistantTurn[], maxUserMsgs = 4): string[]` — return the most recent up-to-`maxUserMsgs` USER message texts (role==='user'), in chronological order, trimmed, dropping empties. (This is the ONLY conversation context sent to the server — question strings, never data.) Pure.

- [ ] **Step 1: Failing tests** `assistant.test.ts`:
  - mixed user/assistant turns → returns only the user texts, chronological, capped at `maxUserMsgs` (most recent N).
  - fewer than N user turns → returns all of them.
  - empty/whitespace user texts dropped.
  - empty input → `[]`.
- [ ] **Step 2: Run fail → implement** → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test assistant` → pass. **Step 4: Commit** named files.

---

### Task 2: thread optional `history` through `/api/agent` + agents

**Files:**
- Modify: `src/app/api/agent/route.ts`, `src/lib/agents/router.ts`, `src/lib/agents/query-money-agent.ts`, `src/lib/agents/query-task-agent.ts`, `src/lib/agents/query-learning-agent.ts`, `src/lib/agents/query-notes-agent.ts`, and the relevant prompt files in `src/lib/agents/prompts/` (router + the query-agent prompts).
- Test: extend/`create` the agent-route test (grep `tests/` for an existing `/api/agent` route test) + a router test if present.

**Interfaces (changes):**
- `/api/agent` RequestSchema gains `history: z.array(z.string().max(500)).max(12).optional().default([])`.
- `routeIntent({ client, text, history? })` — pass `history` into the router call; the ROUTER prompt gets an ADDITIVE instruction: "You may receive recent prior user messages as context. If the current message is a short follow-up (e.g. 'and last month?', 'what about food?'), infer the intent it continues." Include the history in the user turn sent to Groq (e.g. as a "Recent messages:" preamble before the current message).
- Each query agent (`parseMoneyQuery`/`parseTaskQuery`/`parseLearningQuery`/`parseNotesQuery`) gains an optional `history?: string[]`; its prompt gets an ADDITIVE instruction to resolve missing subject/period from the recent messages when the current one is a follow-up; the history is included in the user turn.
- The route passes `parsed.data.history` into `routeIntent` + whichever query agent it dispatches. Log-intent agents do NOT need history (v1 assistant is read-only; but passing it is harmless — keep them unchanged to minimize surface).

- [ ] **Step 1:** RequestSchema `history` field; thread `history` into `routeIntent` + the 4 query-agent calls in the route.
- [ ] **Step 2:** `routeIntent` + the 4 query agents accept `history?: string[]` and prepend a compact "Recent messages:\n- …" block to the Groq `user` content when non-empty. Do NOT change behavior when history is empty/absent.
- [ ] **Step 3:** ADDITIVE prompt lines (router + 4 query prompts) for follow-up resolution — keep them short; must not alter one-shot behavior.
- [ ] **Step 4: Tests** — extend the agent-route test (mock Groq / the agents): (a) a request WITHOUT `history` behaves exactly as before (regression); (b) a request WITH `history` is accepted (schema) and the history reaches `routeIntent`/the query agent (assert via a spy/mock, OR at minimum the route returns 200 and doesn't error). Keep it plumbing-level (LLM quality is out of scope for tests).
- [ ] **Step 5: Gate** `pnpm lint && pnpm typecheck && pnpm test agent router query && pnpm build` → pass. **Step 6: Commit** named files.

---

### Task 3: extract the list-answer renderers into a shared module

**Files:**
- Create: `src/components/query-answers.tsx`
- Modify: `src/app/app/page.tsx` (import from the new module instead of the inline defs)

- [ ] **Step 1:** Move `QueryTaskListAnswer`, `QueryLearningListAnswer`, `QueryNotesListAnswer` (currently inline in `app/page.tsx`) VERBATIM into `src/components/query-answers.tsx`, exporting each; move any imports they need. Behavior-preserving — do NOT change their logic.
- [ ] **Step 2:** In `app/page.tsx`, delete the inline defs and import the three from `@/components/query-answers`. (QueryAnswerCard stays where it is — already its own file.)
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (proves `/app` still compiles + renders identically). **Step 4: Commit** named files.

---

### Task 4: `/assistant` chat page + nav link

**Files:**
- Create: `src/app/assistant/page.tsx`
- Modify: `src/app/app/page.tsx` (a nav link in the header)

- [ ] **Step 1: page** `src/app/assistant/page.tsx` (auth shell like other pages):
  - State: `turns: AssistantTurn[]` (in-memory), `input`, `busy`.
  - `useCategories(userId)` → the `categories` payload (`{ id, name, kind }`) like `/app` sends.
  - On submit: push a `user` turn; `const history = buildAgentHistory(turns)` (BEFORE adding the new turn, or excluding it); POST `/api/agent` `{ text, categories, history }`; on response push an `assistant` turn with `{ intent, payload }`; clear input. Disable input while `busy`. Errors → an assistant turn with a friendly error message.
  - Render the thread: user turns as right-aligned bubbles; assistant turns rendered by intent:
    - `query_money` → `<QueryAnswerCard userId plan={payload as QueryMoneyPlan} onDismiss={noop} />` (a no-op/hidden dismiss in-thread, or omit the dismiss buttons — pass an `onDismiss` that does nothing or hides; simplest: keep the card, `onDismiss` removes that turn).
    - `query_task|query_learning|query_notes` → the matching extracted renderer from `@/components/query-answers`.
    - `chat`/`log_*`/`set_budget`/null → a plain assistant text bubble: for `chat`/unknown → "I can answer questions about your money, tasks, learning, and notes — e.g. 'how much did I spend on food this month?'"; for `log_*`/`set_budget` → "That sounds like something to record — use the + capture on the app screen." (Read-only: do NOT log.)
  - An empty-state welcome + a few example-question chips that prefill the input. Input pinned at the bottom; thread scrolls. No `Date.now()` in render (ids via a counter or `crypto.randomUUID()` in the submit handler).
  - 44px targets, aria-labels, an accessible message log.
- [ ] **Step 2: nav link** in `src/app/app/page.tsx` header — a `<Link href="/assistant">` (e.g. a chat/sparkles icon) beside the existing links, with an aria-label.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /assistant). **Step 4: Commit** named files.

## Self-review

- **Coverage:** history helper (T1) · server history threading + additive follow-up prompts (T2) · shared answer renderers (T3) · the chat thread page reusing them + read-only fallbacks + nav (T4). Voice/actions/persistence/streaming deferred. ✓
- **Placeholders:** none — helper signature + tests explicit; route/agent changes + additive prompts named; extraction is verbatim; page orchestration maps each intent to a concrete renderer.
- **Type consistency:** `AssistantTurn`/`buildAgentHistory` (T1) used by the page (T4); `history` param (T2) fed by T1's output; the extracted renderers (T3) consumed by T4 alongside `QueryAnswerCard`/`QueryPlan`.
- **Guards:** privacy invariant (only text + category names + prior question strings leave the device); history optional → existing capture unchanged (regression-tested); read-only (no mutations from chat); friendly fallbacks for non-query intents; graceful multi-turn (a non-resolving follow-up just answers fresh, no crash).

## Post-merge

Verify prod `/app` + `/assistant` 200 + `/api/agent` unauth → 401. No migration. Owner: open `/assistant`, ask "how much did I spend on food this month?", then a follow-up "what about last month?" to see best-effort context. (Quality depends on the Groq model; the plumbing degrades gracefully if a follow-up doesn't resolve.)
