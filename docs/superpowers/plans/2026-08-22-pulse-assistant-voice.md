# Voice input for the assistant — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let the user ask the `/assistant` questions by voice — on-brand for a voice-first PWA. Reuses the existing Whisper pipeline; quota-efficient.

**Architecture:** Add a **transcribe-only mode** to the existing `/api/voice` (Whisper → emit the transcript → stop, skipping the router/parse). `VoiceRecorder` gains an optional transcribe-only path that yields the transcript via `onTranscript`. The assistant renders a mic button and, on transcript, runs its NORMAL `/api/agent` flow (with history) — so voice questions get the same multi-turn, privacy-preserving handling as typed ones.

## Why transcribe-only (quota)

The user is on a tight free Groq quota. The current `/api/voice` does Whisper + route + parse (3 LLM calls). If the assistant reused it, it would discard the route+parse and re-route with history — 3 wasted calls per voice message. Transcribe-only = Whisper only, then ONE `/api/agent` route+parse. Additive + backward-compatible (default = full flow; the existing capture voice path is unchanged).

## v1 scope + non-goals

- v1 = a mic button on `/assistant`: record → transcribe → the transcript runs the existing assistant submit (with conversation history) → answer in the thread. Read-only (same as the assistant).
- **Deferred:** spoken answers (TTS) in the assistant, streaming partial transcripts into the input, voice in the middle of an existing input.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green. No `Date.now()` in render/useMemo; ESLint rejects synchronous `setState` in an effect BODY (do state changes in handlers/async callbacks).
- **Backward-compat / no regression:** the transcribe-only mode is OPT-IN (a `?mode=transcribe` query param + a `transcribeOnly` option); the existing `/api/voice` full flow + the `/app` capture `VoiceRecorder` (onParsed) must behave EXACTLY as today.
- **Privacy:** voice audio → `/api/voice` (Whisper, server-side, as today); the resulting TRANSCRIPT then flows through `/api/agent` exactly like a typed question (only text + category names + history to the model — never raw entries). Unchanged privacy model.
- Reuse: `groqWhisper` + the `/api/voice` SSE (`src/app/api/voice/route.ts`), `callVoiceApiStreaming` (`src/lib/voice-sse.ts`), `VoiceRecorder` (`src/components/voice-recorder.tsx`).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/assistant` 200, `/api/voice` unauth → 401. **Whole-branch review** (touches the shared voice route + recorder): confirm the full-flow voice capture is unchanged, transcribe-only skips route/parse, and the assistant voice path reuses the normal `/api/agent` flow.

## Background (verified)

- `/api/voice` (SSE): emits `{step:'transcribing'}` → `{step:'transcript', text}` (route.ts:71, AFTER Whisper, BEFORE routing) → `{step:'parsing'}` → `{step:'payload', …}`. The transcript event already exists.
- `callVoiceApiStreaming(blob, onEvent, opts)` POSTs to `/api/voice`, parses the SSE, returns the final payload (or null). `onEvent` already receives the `transcript` event.
- `VoiceRecorder({ onParsed, disabled })` — MediaRecorder → `processBlob` → `callVoiceApiStreaming` → `onParsed(payload, transcript, intent)`. It already sets state on the `transcript` event.
- `/assistant` `handleSubmit` reads `input` state, builds `history = buildAgentHistory(turns)`, POSTs `/api/agent`, appends turns.

---

### Task 1: transcribe-only mode on `/api/voice` + `callVoiceApiStreaming`

**Files:**
- Modify: `src/app/api/voice/route.ts`, `src/lib/voice-sse.ts`
- Test: extend the voice-route test (grep `tests/` for it) if present; else a focused new test.

- [ ] **Step 1: route** In `src/app/api/voice/route.ts`, read `const mode = new URL(req.url).searchParams.get('mode')`. After `send({ step: 'transcript', text: transcript })` (line ~71), if `mode === 'transcribe'`: `controller.close(); return` (inside the try) — skip the router + all parsing. The full flow (no `mode`) is UNCHANGED.
- [ ] **Step 2: client** In `src/lib/voice-sse.ts`, `callVoiceApiStreaming(blob, onEvent, opts)` — add `opts.transcribeOnly?: boolean`; when true, fetch `'/api/voice?mode=transcribe'` (else `'/api/voice'` as today). Everything else unchanged (transcribe mode simply never sends a `payload` event, so `final` stays null — the caller uses the `transcript` event).
- [ ] **Step 3: Test** — voice-route test: a `?mode=transcribe` request (mock `groqWhisper`) streams `transcribing` + `transcript` events and then CLOSES with NO `payload`/`parsing` event and does NOT call the router/parse agents (assert via mocks that routeIntent is not called); a request WITHOUT the param still streams through to a `payload` (regression). Keep it plumbing-level.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test voice && pnpm build` → pass. **Step 5: Commit** named files.

---

### Task 2: `VoiceRecorder` optional transcribe-only path

**Files:** Modify `src/components/voice-recorder.tsx`

- [ ] **Step 1:** Change `Props` to support BOTH modes: `{ onParsed?: (payload: unknown, transcript: string, intent?: string) => void; onTranscript?: (text: string) => void; transcribeOnly?: boolean; disabled?: boolean }`. (Existing callers pass `onParsed` — keep that path identical.)
- [ ] **Step 2:** In `processBlob`, when `transcribeOnly`: call `callVoiceApiStreaming(blob, onEvent, { transcribeOnly: true })`; in the `onEvent` handler, on `{step:'transcript', text}` capture the text; after the stream ends, if `transcribeOnly` and a transcript was captured → `onTranscript?.(text)`, reset to `idle`, and do NOT call `onParsed` / show "parsing". Keep the existing (non-transcribeOnly) `onParsed` flow byte-identical. The recording UI (mic button, states) is shared; in transcribe mode the flow ends at `transcript` instead of `parsing`→`payload`.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm build` → pass (presentational; the /app capture still uses `onParsed` unchanged). **Step 4: Commit** named file.

---

### Task 3: mic button on the `/assistant` page

**Files:** Modify `src/app/assistant/page.tsx`

- [ ] **Step 1:** Refactor `handleSubmit`: extract a `submitText(userText: string)` that does everything the current handler does AFTER reading the input (build history, push user turn, POST `/api/agent`, append assistant/error turns, busy). `handleSubmit(e)` becomes: `e.preventDefault(); const t = input.trim(); if (!t || busy || !userId) return; setInput(''); void submitText(t)`. `submitText` guards `if (busy || !userId) return` and does NOT read `input`.
- [ ] **Step 2:** Render `<VoiceRecorder transcribeOnly onTranscript={(t) => { const text = t.trim(); if (text) void submitText(text) }} disabled={busy || !userId} />` near the input (a compact mic control). On transcript → submit the assistant flow with history (same as typing). Optionally also `setInput(t)` briefly for feedback, but submitting directly is fine.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /assistant). **Step 4: Commit** named file.

## Self-review

- **Coverage:** transcribe-only mode (T1 route + client) · recorder transcribe path (T2) · assistant mic button reusing the normal agent flow with history (T3). TTS/streaming deferred. ✓
- **Placeholders:** none — route/client/recorder/page changes named with exact events + props; `submitText` refactor specified.
- **Type consistency:** `transcribeOnly`/`onTranscript` (T2) fed by `callVoiceApiStreaming` `transcribeOnly` (T1); the page (T3) uses `VoiceRecorder`'s new props + the extracted `submitText`.
- **Guards:** opt-in mode (existing capture voice + /api/voice full flow unchanged, regression-tested); quota-efficient (Whisper only for the assistant); read-only (voice runs the same read-only assistant flow); privacy unchanged (transcript → /api/agent like a typed question).

## Post-merge

Verify prod `/app` + `/assistant` 200 + `/api/voice` unauth → 401. No migration. Owner: `/assistant` → tap the mic, ask "how much did I spend on food this month?" by voice. (Whisper + the agent depend on Groq quota; degrades to the typed input if voice fails.)
