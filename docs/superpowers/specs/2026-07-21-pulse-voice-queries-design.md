# Pulse Voice Queries — Design Spec

**Date:** 2026-07-21
**Status:** Approved direction (all 4 query domains over voice; display + browser-TTS spoken summary; voice-sourced only; localStorage toggle). Ready for implementation plan.
**Scope:** Let the user **ask** their data by voice, not just log by voice. The voice path already transcribes + routes every intent, but `query_*` intents hit a dead `else` (`payload: null`). This completes them: voice → transcribe → route → query agent → plan → client executes over Dexie → the existing answer card/list renders **and** a concise summary is spoken aloud via the browser's on-device `SpeechSynthesis`.

## Goal

Say *"how much did I spend on food last month?"* / *"what's overdue?"* / *"what did I learn about Rust?"* / *"find my note about the wifi password"* into the mic and get the same on-screen answer the text path already produces, plus a short spoken summary (*"You spent 8,000 rupees on food last month."*). Reuses the shipped query agents + `QueryAnswerCard`/`QueryListAnswer` wholesale; adds no server-side data exposure (the agent still returns only a plan; execution + summary are client-side).

## Current state (what exists / what's missing)

- `/api/voice` (SSE): audio → Whisper transcript → `routeIntent` (all 10 intents) → for `log_*` sends a `payload` event; for **`query_*`/`chat` it sends `payload: null`** (a documented "query_money lands in 2.6" TODO, never done). ← the gap.
- Client: `callVoiceApiStreaming` (`src/lib/voice-sse.ts`) streams events → `VoiceRecorder.onParsed(payload, transcript)` in `page.tsx`. That handler currently routes **only** `kind === 'query_money'` to `setQueryPlan` (a stub) — but the server never sends a query payload, so it's dead.
- The `/app` query answer render already branches on all 4 `query_*` kinds (`QueryAnswerCard` for money, `QueryListAnswer`-based for task/learning/notes). No new answer UI needed.
- The text path (`parseText`) already routes all query kinds via `isQueryPlan(payload) → setQueryPlan`. Voice must match that.

## Architecture

Mirror the text `/api/agent` query branches in the voice route; route the streamed plan to the existing `queryPlan` slot (tagged `source: 'voice'`); reuse the shipped answer components; speak a client-built summary.

### 1. Voice route (`src/app/api/voice/route.ts`)
Replace the `else { payload: null }` with four branches identical to the `/api/agent` query branches (same agents, same plan payload shape) — importing `parseMoneyQuery`, `parseTaskQuery`, `parseLearningQuery`, `parseNotesQuery`:
- `query_money` → `{ step:'payload', intent:'query_money', transcript, payload:{ kind:'query_money', direction, category_name, mode, bucket, period } }`
- `query_task` → `{ …payload:{ kind:'query_task', status, period } }`
- `query_learning` → `{ …payload:{ kind:'query_learning', search, tags, period } }`
- `query_notes` → `{ …payload:{ kind:'query_notes', search, tags, period } }`
- `chat` → `payload: null` (unchanged).
Reads only; no `source` field on the plan (queries don't write). Categories are already loaded in the route (used by `query_money`).

### 2. Client routing (`src/app/app/page.tsx`)
- Add `querySource` state: `'voice' | 'text' | null`.
- Text `parseText`: on `isQueryPlan`, set `querySource='text'` alongside `setQueryPlan`.
- `VoiceRecorder.onParsed`: replace the `kind==='query_money'`-only check with `isQueryPlan(payload) → { setQueryPlan(payload); setQuerySource('voice') }` (all 4 kinds, matching text). Non-query voice payloads (log chips) unchanged.
- Clear `querySource` when `queryPlan` is dismissed.

### 3. Spoken summary (the new capability)
- **Pure builder** `src/lib/speak-answer.ts`: `speakableAnswer(result: SpokenAnswerInput): string` — per-kind, speech-friendly sentences over the **executed** result (NOT the raw plan):
  - money `total`: *"You spent 8,000 rupees on food last month."* (direction + figure + category + period label)
  - money `breakdown`: *"Top last month: food 8,000 rupees, transport 3,000."* (top 2-3 only)
  - money `delta`: *"8,000 rupees this month, up 12% from last."* (omit % if previous is 0)
  - money `series`: *"8,000 rupees total over the period."* (a sparkline doesn't read aloud — summarize the sum)
  - `query_task`: *"3 open tasks, 1 overdue."* (count + status; singular/plural)
  - `query_learning`: *"5 learnings"* (+ topic if `search` set)
  - `query_notes`: *"Found 2 notes"* (+ topic if `search` set)
  - empty states: *"No entries match."* / *"No open tasks."* etc.
  - Numbers formatted for speech (grouped, currency spoken as a word: "rupees"/"dollars"; use a small currency-word map). Pure + fully unit-tested.
- **Speech util** `src/lib/speak.ts`: `speak(text: string)` — SSR/availability-guarded (`typeof window`, `'speechSynthesis' in window`); cancels any in-flight utterance, then `speechSynthesis.speak(new SpeechSynthesisUtterance(text))`; `cancelSpeech()` to stop. Reads the localStorage toggle (below); no-ops when off/unavailable. No throw ever.
- **Result hand-off:** the answer surfaces already compute their result for display; add an **optional** `onResult?(result: SpokenAnswerInput)` prop to `QueryAnswerCard` and the list-answer render, fired after execution. `page.tsx` passes a handler that, **iff `querySource==='voice'`**, calls `speak(speakableAnswer(result))`. Text queries pass no handler (or a noop) → silent. This keeps the summary display-consistent (no re-execution) and confines the shared-component change to one optional, default-off callback.

### 4. Toggle + controls
- **localStorage** key `pulse.voiceAnswers` (default **on**) — no `user_prefs`/sync/entity change (mirrors the PIN-lock local-setting precedent).
- A **Settings → toggle** ("Speak answers aloud") to disable globally, and a **stop control** on a currently-speaking voice answer (calls `cancelSpeech()`; also cancel on dismiss/navigation).
- The initiating mic tap is a user gesture, so browsers permit speech.

## Non-goals (YAGNI)
- No server-side / paid TTS — browser `SpeechSynthesis` only (respects the no-paid-API constraint).
- Text queries stay silent (voice-sourced answers only).
- No wake-word / continuous listening / conversation; one tap → one answer.
- No reading long lists verbatim — the spoken summary is a count + headline figure.
- No new entity_kind / Dexie store / migration / op-schema / router change / new query agent — this is purely the voice route's query branches + client wiring + a client-side speak layer.
- No voice output for `log_*` confirmations (they already show a chip).

## Global constraints
- Stack unchanged; **no new dependencies** (SpeechSynthesis is a Web API). Dark-glass conventions; a11y (the stop control labeled + focusable; speaking is additive to the visible answer, never the only channel).
- Reads only — no writes on the query path (server or client), consistent with the shipped text Query feature.
- Agent response schemas reuse the existing `query-*-response` schemas (no change). The voice route mirrors `/api/agent` exactly for the four query intents.
- Gate every task: `pnpm typecheck` + `pnpm lint` + `pnpm test` (baseline 689; grows; run `pnpm test` UN-CHAINED) + **`pnpm build`**. Git identity `sdsheikahamed@gmail.com`. Branch `feature/voice-queries`.

## Testing & verification
- **Pure `speakableAnswer`** (unit): each kind; empty/singular/plural; number-for-speech formatting; multi-currency word; delta with previous=0 (no %); breakdown top-N truncation.
- **`speak` util** (unit): no-throw + no-op when `speechSynthesis` absent (jsdom) and when the toggle is off; cancels prior utterance before speaking.
- **Voice route** (Groq + Whisper mocked): each `query_*` transcript → a `payload` event with the correct plan kind/shape; `chat` → `payload: null`; mirrors the agent-route query tests.
- **Client wiring:** typecheck + lint + build; no component unit tests (repo convention). QA runbook covers manual device checks.
- **Manual (deployed PWA):** speak one query per domain → correct on-screen answer + a sensible spoken summary; toggle off → silent but still displays; a voice `log_*` still shows a chip (no query misroute); dismiss cancels speech.

## Risks & mitigations
- **SpeechSynthesis variance across devices/browsers** (iOS Safari voice/latency) → feature-detect + graceful no-op; speaking is additive to the always-present visual answer, so a silent device loses nothing.
- **Summary drift from the displayed result** → the summary is built from the SAME executed result the card renders (via `onResult`), not a re-execution or the plan.
- **Speech continuing after dismiss/navigation** → `cancelSpeech()` on dismiss, on a new query, and on unmount.
- **Voice log→query misroute** (router) → unchanged from the shipped router; voice uses the same `routeIntent`; the confirmation-chip/answer is dismissible. Ambiguous-verb tuning remains the deferred live-eval item.
