# Chat-intent help affordance — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Close the dead `chat` router intent. Today when the router classifies input as `chat` (greetings, "what can you do", chit-chat, unparseable), the agent route returns `{ intent:'chat', payload:null }` and the app **silently clears the input** — a confusing no-op. Replace that with a **help affordance**: a dismissible card listing what Pulse can capture/ask, with tappable example prompts. Also expose it from a small "?" button for discoverability (helps first-time self-hosters).

**Architecture:** **Pure client change.** The `/api/agent` response already carries `data.intent` for every case (including the `chat` fall-through), so no route/agent/schema change is needed. Deterministic, no extra Groq call, on-ethos (no open-ended LLM chat → protects the free-tier quota + privacy).

## Global Constraints

- Client-only. NO route/agent/schema/migration/sync change.
- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails the deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo (`react-hooks/purity`).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app` 200 after.

## Background (current code)

- `src/app/api/agent/route.ts`: every response includes `intent`. The `chat` (and any unhandled) intent hits the fall-through: `{ transcript, intent: router.intent, confidence, payload: null }`. The error/502 path returns `{ intent: null, payload: null, error }`.
- `src/app/app/page.tsx` `parseText()`: `const data = await res.json() as { intent: string; payload: ChipDraft | QueryPlan | null }`. Currently: if `!data.payload` → `setText(''); return` (silent). On fetch/throw → falls back to a blank money draft.
- Voice path: `<VoiceRecorder onParsed={(payload, transcript) => …}>` — when `payload` is null it currently opens a blank money draft. Check whether the voice final (`callVoiceApiStreaming` / `src/lib/voice-sse.ts` + `/api/voice`) exposes `intent`; if it does, route `chat` → help there too, otherwise leave voice as-is (out of scope creep).
- The input header lives in `app/page.tsx` around the `VoiceRecorder`/`ReceiptButton`/`+Add`/text-form row.

---

### Task 1: HelpCard + wire the chat intent (text path) + a "?" button

**Files:**
- Create: `src/components/help-card.tsx`, `src/lib/help-examples.ts`, `src/lib/help-examples.test.ts`
- Modify: `src/app/app/page.tsx`

**Interfaces (Produces):**
- `src/lib/help-examples.ts`: `export type HelpExample = { label: string; prompt: string; domain: 'money'|'task'|'learning'|'note'|'ask' }` and `export const HELP_EXAMPLES: HelpExample[]` — a small fixed list, e.g.:
  - money: `{ label: 'Log a spend', prompt: 'spent 200 on lunch', domain: 'money' }`
  - task: `{ label: 'Add a reminder', prompt: 'remind me to call mom tomorrow', domain: 'task' }`
  - learning: `{ label: 'Log a learning', prompt: 'I learned that HLCs order events without clocks', domain: 'learning' }`
  - note: `{ label: 'Keep a note', prompt: 'note: wifi password is hunter2', domain: 'note' }`
  - ask: `{ label: 'Ask your data', prompt: 'how much did I spend on food this month?', domain: 'ask' }`
  - ask: `{ label: 'Check tasks', prompt: "what's overdue?", domain: 'ask' }`
  (Pure data + a trivial helper if useful, e.g. `examplesByDomain()`. The test just asserts the list is non-empty, every prompt is a non-empty string, and each `domain` is one of the allowed values — a guard so the list can't rot into an invalid shape.)
- `src/components/help-card.tsx`: `export function HelpCard({ onPick, onDismiss }: { onPick: (prompt: string) => void; onDismiss: () => void })` — a `glass rounded-2xl p-4` card titled "Here's what I can do", a one-line intro ("Type or say one line — I'll file it in the right place."), the examples grouped/listed as tappable 44px buttons (each shows `label` + a muted monospace `prompt`); tapping calls `onPick(prompt)`. A Dismiss button calls `onDismiss`. `role="group"`, `aria-label="Pulse help"`. Theme-aware (existing glass tokens).

- [ ] **Step 1: Create `src/lib/help-examples.ts` + a failing test** asserting: non-empty; every `prompt` is a non-empty trimmed string; every `domain` ∈ the allowed set. Run → fail → implement → pass.
- [ ] **Step 2: Create `src/components/help-card.tsx`** per the interface (presentational; no unit test).
- [ ] **Step 3: Wire the text path** in `app/page.tsx` `parseText()`: add `const [showHelp, setShowHelp] = useState(false)` near the other UI state. In the success branch, BEFORE the `if (!data.payload)` clear, add:
  ```ts
  if (data.intent === 'chat') { setShowHelp(true); setText(''); return }
  ```
  Keep the existing `!data.payload` clear (for e.g. set_budget with no matching category) and the catch→blank-money-draft fallback unchanged.
- [ ] **Step 4: Render the card + a "?" button.** Render `{showHelp && <HelpCard onPick={(p) => { setShowHelp(false); setText(p) }} onDismiss={() => setShowHelp(false)} />}` in the same transient-card region the query answer cards use (so it sits above the tab content, and is mutually exclusive-ish with an active draft/query — don't show it while a `draft`/`queryPlan` is active; simplest: only render when `!draft && !queryPlan`). `onPick` fills the input with the example (user reviews then hits Parse) — do NOT auto-submit. Add a small 44px "?" button in the input header (near `+Add`) that opens the card (`setShowHelp(true)`), `aria-label="What can I do?"`.
- [ ] **Step 5 (voice, only if cheap):** inspect `src/lib/voice-sse.ts` + `/api/voice` to see if the streamed final exposes `intent`. If yes, in `VoiceRecorder`'s `onParsed` (or wherever the voice final is handled in `app/page.tsx`) treat `intent==='chat'` → `setShowHelp(true)` instead of opening a blank money draft. If the intent is NOT readily available from the voice final, SKIP this step (leave voice behavior unchanged) and note it in the report — do not refactor the voice pipeline for this.
- [ ] **Step 6: Gate** `pnpm lint && pnpm typecheck && pnpm test help-examples && pnpm build` → all green.
- [ ] **Step 7: Commit** — `git add src/lib/help-examples.ts src/lib/help-examples.test.ts src/components/help-card.tsx src/app/app/page.tsx && git commit -m "feat: help affordance for the chat intent (dismissible card + example prompts + ? button)"`

## Self-review

- **Coverage:** chat intent no longer a silent no-op (text path → HelpCard); discoverable via "?"; examples teach the capture syntax. Voice covered iff the intent is cheaply available. ✓
- **Placeholders:** none — the example list + component contract + the exact `parseText` hook are specified.
- **Scope:** pure client; no route/schema change; voice pipeline not refactored.

## Post-merge

Verify prod `/app` 200. Typing "hi" / "what can you do" now surfaces the help card instead of clearing silently; the "?" opens it any time.
