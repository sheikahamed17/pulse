# Pulse Voice Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user ask their data by voice — the voice path routes `query_*` intents to the shipped query agents, renders the existing answer card/list, and speaks a concise summary via the browser's `SpeechSynthesis`.

**Architecture:** Fill the voice route's dead `query_*` `else` with branches mirroring `/api/agent`; route the streamed plan to the existing `queryPlan` slot tagged `source:'voice'`; each answer surface emits its computed result via an optional `onResult(SpokenAnswerInput)`; the page speaks it (via a pure `speakableAnswer` builder + a guarded `speak` util) only for voice-sourced answers, gated by a localStorage toggle.

**Tech Stack:** Next 16 / React 19 / Groq (Whisper + gpt-oss) / browser Web Speech API (`SpeechSynthesis`). Spec: `docs/superpowers/specs/2026-07-21-pulse-voice-queries-design.md`.

## Global Constraints

- **Read the spec** — it governs. Reads only; **no writes** on the query path (server or client).
- **No new dependencies** (SpeechSynthesis is a Web API); **no new entity_kind / Dexie store / migration / op-schema / router change / query agent**. This is voice-route query branches + client wiring + a client-side speak layer.
- **No new cron triggers** (Cloudflare caps at 5; this feature adds none — clear).
- Reuse the shipped query agents (`parseMoneyQuery`/`parseTaskQuery`/`parseLearningQuery`/`parseNotesQuery`) and answer components (`QueryAnswerCard`, `QueryListAnswer`, and the `QueryTaskListAnswer`/`QueryLearningListAnswer`/`QueryNotesListAnswer` functions in `page.tsx`). Voice route mirrors the `/api/agent` query branches EXACTLY.
- Text queries stay **silent**; only `source:'voice'` answers speak. `speak` no-ops when `SpeechSynthesis` is absent or the toggle is off, and never throws.
- localStorage toggle key `pulse.voiceAnswers` (default **on**) — no `user_prefs`/server/sync change.
- Amounts are integer **minor units** (÷100 for display/speech, except JPY = ÷1). Currency ∈ `SUPPORTED_CURRENCIES`.
- Dark-glass + a11y conventions (stop control labeled + focusable; speech is additive to the always-visible answer).
- **Gate every task, run UN-CHAINED:** `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` (baseline **689**; grows). Git identity `sdsheikahamed@gmail.com`. Branch `feature/voice-queries` (spec committed @ `14a2a27`).

---

## File Structure

**Create:**
- `src/lib/speak-answer.ts` — `SpokenAnswerInput` union + pure `speakableAnswer(input) → string`.
- `src/lib/speak.ts` — guarded `speak(text)`, `cancelSpeech()`, `isVoiceAnswersEnabled()`, `setVoiceAnswersEnabled(on)` (localStorage).
- Tests: `tests/lib/speak-answer.test.ts`, `tests/lib/speak.test.ts`.

**Modify:**
- `src/app/api/voice/route.ts` — 4 query branches (+ `tests/api/voice-route.test.ts`).
- `src/components/query-answer-card.tsx` — optional `onResult` prop.
- `src/app/app/page.tsx` — `querySource` state; `VoiceRecorder.onParsed` → `isQueryPlan`; `onResult` handler → speak; pass `onResult` to the 4 answer surfaces; the 3 list-answer functions build + emit `SpokenAnswerInput`.
- `src/app/settings/preferences/page.tsx` — "Speak answers aloud" localStorage toggle.
- Docs: `docs/superpowers/notes/2026-07-21-pulse-voice-queries-qa-runbook.md`.

---

## Task 1: Spoken-summary builder + speak util (pure core)

**Files:**
- Create: `src/lib/speak-answer.ts`, `src/lib/speak.ts`, `tests/lib/speak-answer.test.ts`, `tests/lib/speak.test.ts`

**Interfaces — Produces:**
- `SpokenAnswerInput` (discriminated union, below).
- `speakableAnswer(input: SpokenAnswerInput): string` — pure.
- `speak(text: string): void`, `cancelSpeech(): void`, `isVoiceAnswersEnabled(): boolean`, `setVoiceAnswersEnabled(on: boolean): void` (localStorage `pulse.voiceAnswers`, default on).

- [ ] **Step 1: failing tests — `tests/lib/speak-answer.test.ts`:**
```typescript
import { describe, it, expect } from 'vitest'
import { speakableAnswer } from '@/lib/speak-answer'

describe('speakableAnswer — money', () => {
  it('total (spend)', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'out', categoryName: 'Food', periodLabel: 'last month', currency: 'INR', total: 800000 }))
      .toBe('You spent 8,000 rupees on Food last month.')
  })
  it('total income, no category', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'in', categoryName: null, periodLabel: 'this month', currency: 'USD', total: 500000 }))
      .toBe('You received 5,000 dollars this month.')
  })
  it('total zero → empty phrasing', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'out', categoryName: 'Food', periodLabel: 'today', currency: 'INR', total: 0 }))
      .toBe('No spending on Food today.')
  })
  it('JPY has no minor units', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'out', categoryName: null, periodLabel: 'this week', currency: 'JPY', total: 5000 }))
      .toBe('You spent 5,000 yen this week.')
  })
  it('delta up', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'delta', direction: 'out', categoryName: null, periodLabel: 'this month', currency: 'INR', current: 800000, deltaPct: 12 }))
      .toBe('You spent 8,000 rupees this month, up 12% from the previous period.')
  })
  it('delta with null pct (previous was zero)', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'delta', direction: 'out', categoryName: null, periodLabel: 'this month', currency: 'INR', current: 800000, deltaPct: null }))
      .toBe('You spent 8,000 rupees this month.')
  })
  it('breakdown names top categories', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'breakdown', direction: 'out', categoryName: null, periodLabel: 'last month', currency: 'INR', top: [{ name: 'Food', amount: 800000 }, { name: 'Transport', amount: 300000 }] }))
      .toBe('Top spending last month: Food 8,000 rupees, Transport 3,000 rupees.')
  })
  it('series summarizes the total', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'series', direction: 'out', categoryName: null, periodLabel: 'this year', currency: 'INR', total: 1200000 }))
      .toBe('You spent 12,000 rupees total this year.')
  })
})

describe('speakableAnswer — lists', () => {
  it('open tasks plural', () => {
    expect(speakableAnswer({ kind: 'task', count: 3, status: 'open' })).toBe('You have 3 open tasks.')
  })
  it('overdue singular', () => {
    expect(speakableAnswer({ kind: 'task', count: 1, status: 'overdue' })).toBe('You have 1 overdue task.')
  })
  it('no open tasks', () => {
    expect(speakableAnswer({ kind: 'task', count: 0, status: 'open' })).toBe('You have no open tasks.')
  })
  it('learnings with topic', () => {
    expect(speakableAnswer({ kind: 'learning', count: 5, search: 'Rust' })).toBe('5 learnings about Rust.')
  })
  it('notes none found', () => {
    expect(speakableAnswer({ kind: 'notes', count: 0, search: 'wifi' })).toBe('No notes about wifi found.')
  })
  it('notes plural no topic', () => {
    expect(speakableAnswer({ kind: 'notes', count: 2, search: null })).toBe('Found 2 notes.')
  })
})
```

- [ ] **Step 2: run → FAIL** (`pnpm test tests/lib/speak-answer.test.ts`).

- [ ] **Step 3: implement `src/lib/speak-answer.ts`:**
```typescript
export type SpokenAnswerInput =
  | {
      kind: 'money'
      mode: 'total' | 'breakdown' | 'delta' | 'series'
      direction: 'out' | 'in'
      categoryName: string | null
      periodLabel: string
      currency: string
      total?: number                                   // minor units (total/series)
      current?: number                                 // minor units (delta)
      deltaPct?: number | null                         // delta
      top?: { name: string | null; amount: number }[]  // breakdown (already sorted desc)
    }
  | { kind: 'task'; count: number; status: 'open' | 'overdue' | 'done' | 'all' }
  | { kind: 'learning'; count: number; search: string | null }
  | { kind: 'notes'; count: number; search: string | null }

const CURRENCY_WORD: Record<string, string> = {
  INR: 'rupees', USD: 'dollars', EUR: 'euros', GBP: 'pounds',
  AED: 'dirhams', SGD: 'Singapore dollars', JPY: 'yen', AUD: 'Australian dollars', CAD: 'Canadian dollars',
}
const ZERO_MINOR = new Set(['JPY'])

function money(amountMinor: number, currency: string): string {
  const major = amountMinor / (ZERO_MINOR.has(currency) ? 1 : 100)
  const num = major.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return `${num} ${CURRENCY_WORD[currency] ?? currency}`
}

const verb = (dir: 'out' | 'in') => (dir === 'out' ? 'spent' : 'received')
const noun = (dir: 'out' | 'in') => (dir === 'out' ? 'spending' : 'income')

export function speakableAnswer(input: SpokenAnswerInput): string {
  if (input.kind === 'money') {
    const on = input.categoryName ? ` on ${input.categoryName}` : ''
    if (input.mode === 'breakdown') {
      const top = (input.top ?? []).slice(0, 2)
      if (top.length === 0) return `No ${noun(input.direction)}${on} ${input.periodLabel}.`
      const parts = top.map(t => `${t.name ?? 'uncategorized'} ${money(t.amount, input.currency)}`)
      return `Top ${noun(input.direction)} ${input.periodLabel}: ${parts.join(', ')}.`
    }
    if (input.mode === 'delta') {
      const base = `You ${verb(input.direction)} ${money(input.current ?? 0, input.currency)}${on} ${input.periodLabel}`
      if (input.deltaPct == null) return `${base}.`
      const dir = input.deltaPct >= 0 ? 'up' : 'down'
      return `${base}, ${dir} ${Math.abs(Math.round(input.deltaPct))}% from the previous period.`
    }
    // total | series
    const amt = input.total ?? 0
    if (amt === 0) return `No ${noun(input.direction)}${on} ${input.periodLabel}.`
    const totalWord = input.mode === 'series' ? ' total' : ''
    return `You ${verb(input.direction)} ${money(amt, input.currency)}${on}${totalWord} ${input.periodLabel}.`
  }

  if (input.kind === 'task') {
    const label = input.status === 'open' ? 'open ' : input.status === 'overdue' ? 'overdue ' : input.status === 'done' ? 'completed ' : ''
    const nounw = input.count === 1 ? 'task' : 'tasks'
    if (input.count === 0) return `You have no ${label}${nounw}.`
    return `You have ${input.count} ${label}${nounw}.`
  }

  const topic = input.search ? ` about ${input.search}` : ''
  const nounw = input.kind === 'learning' ? (input.count === 1 ? 'learning' : 'learnings') : (input.count === 1 ? 'note' : 'notes')
  if (input.count === 0) return `No ${nounw}${topic} found.`
  if (input.kind === 'learning') return `${input.count} ${nounw}${topic}.`
  return `Found ${input.count} ${nounw}${topic}.`
}
```

- [ ] **Step 4: run → PASS.**

- [ ] **Step 5: failing tests — `tests/lib/speak.test.ts`:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { speak, cancelSpeech, isVoiceAnswersEnabled, setVoiceAnswersEnabled } from '@/lib/speak'

describe('speak util', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  afterEach(() => { delete (globalThis as { speechSynthesis?: unknown }).speechSynthesis })

  it('defaults to enabled', () => {
    expect(isVoiceAnswersEnabled()).toBe(true)
  })
  it('setVoiceAnswersEnabled(false) persists + disables', () => {
    setVoiceAnswersEnabled(false)
    expect(isVoiceAnswersEnabled()).toBe(false)
    expect(localStorage.getItem('pulse.voiceAnswers')).toBe('off')
  })
  it('speak() no-ops (no throw) when speechSynthesis is absent', () => {
    expect(() => speak('hello')).not.toThrow()
  })
  it('speak() no-ops when toggle is off', () => {
    const speakSpy = vi.fn()
    ;(globalThis as { speechSynthesis?: unknown }).speechSynthesis = { speak: speakSpy, cancel: vi.fn() }
    ;(globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class { constructor(public text: string) {} }
    setVoiceAnswersEnabled(false)
    speak('hello')
    expect(speakSpy).not.toHaveBeenCalled()
  })
  it('speak() cancels prior utterance then speaks when enabled + available', () => {
    const speakSpy = vi.fn(); const cancelSpy = vi.fn()
    ;(globalThis as { speechSynthesis?: unknown }).speechSynthesis = { speak: speakSpy, cancel: cancelSpy }
    ;(globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class { constructor(public text: string) {} }
    speak('hello')
    expect(cancelSpy).toHaveBeenCalled()
    expect(speakSpy).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 6: run → FAIL.**

- [ ] **Step 7: implement `src/lib/speak.ts`:**
```typescript
const TOGGLE_KEY = 'pulse.voiceAnswers'

export function isVoiceAnswersEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(TOGGLE_KEY) !== 'off'   // default on
}

export function setVoiceAnswersEnabled(on: boolean): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off')
}

type SpeechCapable = {
  speechSynthesis?: { speak: (u: unknown) => void; cancel: () => void }
  SpeechSynthesisUtterance?: new (text: string) => unknown
}

function synth(): SpeechCapable['speechSynthesis'] | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as SpeechCapable
  if (!g.speechSynthesis || !g.SpeechSynthesisUtterance) return null
  return g.speechSynthesis
}

export function cancelSpeech(): void {
  synth()?.cancel()
}

/** Speak `text` iff the toggle is on and SpeechSynthesis is available. Never throws. */
export function speak(text: string): void {
  try {
    if (!text || !isVoiceAnswersEnabled()) return
    const s = synth()
    if (!s) return
    const Utter = (globalThis as SpeechCapable).SpeechSynthesisUtterance!
    s.cancel()                       // stop any in-flight utterance
    s.speak(new Utter(text))
  } catch {
    /* speech is best-effort; never break the UI */
  }
}
```

- [ ] **Step 8: run → PASS.**

- [ ] **Step 9: gate + commit.** typecheck → lint → test → build (all green; +~19 tests). Then:
```bash
git add src/lib/speak-answer.ts src/lib/speak.ts tests/lib/speak-answer.test.ts tests/lib/speak.test.ts
git commit -m "feat(voice): pure speakableAnswer builder + guarded SpeechSynthesis speak util"
```

---

## Task 2: Voice route query branches

**Files:**
- Modify: `src/app/api/voice/route.ts`, `tests/api/voice-route.test.ts`

**Interfaces — Consumes:** `parseMoneyQuery`, `parseTaskQuery`, `parseLearningQuery`, `parseNotesQuery` (`@/lib/agents/query-*-agent`). **Produces:** a `payload` SSE event with `{ kind: 'query_money'|'query_task'|'query_learning'|'query_notes', ...plan }` for query intents.

- [ ] **Step 1: add imports to `src/app/api/voice/route.ts`** (next to the existing agent imports):
```typescript
import { parseMoneyQuery } from '@/lib/agents/query-money-agent'
import { parseTaskQuery } from '@/lib/agents/query-task-agent'
import { parseLearningQuery } from '@/lib/agents/query-learning-agent'
import { parseNotesQuery } from '@/lib/agents/query-notes-agent'
```

- [ ] **Step 2: replace the `else { payload: null }` block** (the branch after `log_note`) with the four query branches + a `chat` fallback. These mirror the `/api/agent` query branches exactly:
```typescript
        } else if (router.intent === 'query_money') {
          const plan = await parseMoneyQuery({
            client: groq,
            text: transcript,
            categories: cats.map(c => ({ name: c.name, kind: c.kind as 'spend' | 'income' })),
            nowIso,
            userTz: prefs.tz,
          })
          send({ step: 'payload', intent: 'query_money', transcript, payload: {
            kind: 'query_money', direction: plan.direction, category_name: plan.category_name,
            mode: plan.mode, bucket: plan.bucket, period: plan.period,
          } })
        } else if (router.intent === 'query_task') {
          const plan = await parseTaskQuery({ client: groq, text: transcript, nowIso, userTz: prefs.tz })
          send({ step: 'payload', intent: 'query_task', transcript, payload: {
            kind: 'query_task', status: plan.status, period: plan.period,
          } })
        } else if (router.intent === 'query_learning') {
          const plan = await parseLearningQuery({ client: groq, text: transcript, nowIso, userTz: prefs.tz })
          send({ step: 'payload', intent: 'query_learning', transcript, payload: {
            kind: 'query_learning', search: plan.search, tags: plan.tags, period: plan.period,
          } })
        } else if (router.intent === 'query_notes') {
          const plan = await parseNotesQuery({ client: groq, text: transcript, nowIso, userTz: prefs.tz })
          send({ step: 'payload', intent: 'query_notes', transcript, payload: {
            kind: 'query_notes', search: plan.search, tags: plan.tags, period: plan.period,
          } })
        } else {
          // chat — no actionable payload
          send({ step: 'payload', intent: router.intent, transcript, payload: null })
        }
```

- [ ] **Step 3: add tests to `tests/api/voice-route.test.ts`** (mirror the existing SSE test + mock the query agents like `agent-route.test.ts`). Add mocks for the 4 query agents at the top with the other `vi.mock`s, e.g.:
```typescript
vi.mock('@/lib/agents/query-money-agent', () => ({
  parseMoneyQuery: vi.fn().mockResolvedValue({
    direction: 'out', category_name: 'Food', mode: 'total',
    period: { from: '2026-06-11T00:00:00.000Z', to: '2026-06-18T00:00:00.000Z', label: 'last week' },
  }),
}))
vi.mock('@/lib/agents/query-task-agent', () => ({
  parseTaskQuery: vi.fn().mockResolvedValue({ status: 'overdue', period: null }),
}))
```
Then a test (mock `routeIntent` → `query_money`, whisper → a query transcript):
```typescript
it('emits a query_money plan payload for a money question', async () => {
  const { routeIntent } = await import('@/lib/agents/router')
  ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_money', confidence: 0.93 })
  const res = await POST(multipartReq(new Blob(['x'], { type: 'audio/webm' })))
  const events = await consumeSSE(res)
  expect(events.map(e => e.step)).toEqual(['transcribing', 'transcript', 'parsing', 'payload'])
  const payload = (events[3] as { payload: { kind: string; mode: string } }).payload
  expect(payload.kind).toBe('query_money')
  expect(payload.mode).toBe('total')
})
it('emits a query_task plan payload for a task question', async () => {
  const { routeIntent } = await import('@/lib/agents/router')
  ;(routeIntent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ intent: 'query_task', confidence: 0.9 })
  const res = await POST(multipartReq(new Blob(['x'], { type: 'audio/webm' })))
  const events = await consumeSSE(res)
  const payload = (events[3] as { payload: { kind: string; status: string } }).payload
  expect(payload.kind).toBe('query_task')
  expect(payload.status).toBe('overdue')
})
```
(Match the file's existing whisper/router mock setup + `consumeSSE` helper + `multipartReq`. Confirm the whisper mock returns a transcript for these cases — reuse the existing default or add `mockResolvedValueOnce`.)

- [ ] **Step 4: run tests → PASS** (`pnpm test tests/api/voice-route.test.ts`).

- [ ] **Step 5: gate + commit.** typecheck → lint → test → build. Then:
```bash
git add src/app/api/voice/route.ts tests/api/voice-route.test.ts
git commit -m "feat(voice): route query_* intents to the query agents (mirror /api/agent)"
```

---

## Task 3: Client wiring + spoken-answer integration

**Files:**
- Modify: `src/components/query-answer-card.tsx`, `src/app/app/page.tsx`

**Interfaces — Consumes:** `SpokenAnswerInput`, `speakableAnswer` (Task 1), `speak`/`cancelSpeech` (Task 1); `isQueryPlan` (`@/lib/query-plans`). **Produces:** voice-sourced query answers that render (existing UI) + speak once.

**No component unit tests (repo convention); gate = typecheck + lint + build + existing 689+ tests unchanged.**

- [ ] **Step 1: `QueryAnswerCard` optional `onResult` — `src/components/query-answer-card.tsx`.** Add to `Props`:
```typescript
type Props = {
  userId: string
  plan: QueryMoneyPlan
  onDismiss: () => void
  onResult?: (input: import('@/lib/speak-answer').SpokenAnswerInput) => void
}
```
After `modeData` is computed, add a `useEffect` that builds a `SpokenAnswerInput` from the plan + modeData and calls `onResult` once per plan/result. Import `useEffect` if needed:
```typescript
  useEffect(() => {
    if (!onResult) return
    const base = { kind: 'money' as const, mode: plan.mode, direction: plan.direction, categoryName: plan.category_name, periodLabel: plan.period.label, currency: primaryCurrency }
    if (plan.mode === 'breakdown') {
      onResult({ ...base, top: modeData.breakdown.map(b => ({ name: b.categoryName, amount: b.amount })) })
    } else if (plan.mode === 'delta') {
      onResult({ ...base, current: modeData.delta.current, deltaPct: modeData.delta.deltaPct })
    } else if (plan.mode === 'series') {
      onResult({ ...base, total: modeData.series.reduce((s, p) => s + p.amount, 0) })
    } else {
      onResult({ ...base, total: modeData.total.amount })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, modeData])
```
(`primaryCurrency` = the card's existing primary-currency value used for display — use whatever local it already computes for `currencySymbol`; if it's `prefs.primary_currency`, use that. The reviewer/implementer confirms the exact local name when editing.)

- [ ] **Step 2: `page.tsx` — `querySource` state + speak handler.** Add near `queryPlan` (line ~239):
```typescript
const [querySource, setQuerySource] = useState<'voice' | 'text' | null>(null)
```
Add imports:
```typescript
import { speak, cancelSpeech } from '@/lib/speak'
import { speakableAnswer, type SpokenAnswerInput } from '@/lib/speak-answer'
```
Add a handler (inside the component):
```typescript
function handleAnswerResult(input: SpokenAnswerInput) {
  if (querySource === 'voice') speak(speakableAnswer(input))
}
function dismissQuery() {
  cancelSpeech()
  setQueryPlan(null)
  setQuerySource(null)
}
```

- [ ] **Step 3: `page.tsx` — set source on the two query entry points.**
Text (`parseText`, line ~358):
```typescript
      if (isQueryPlan(data.payload)) {
        setQueryPlan(data.payload)
        setQuerySource('text')
        setText('')
      } else {
```
Voice (`VoiceRecorder.onParsed`, replace the `kind==='query_money'` check, line ~555):
```typescript
                  } else if (isQueryPlan(payload)) {
                    setQueryPlan(payload)
                    setQuerySource('voice')
                  } else {
                    setDraft(payload as ChipDraft)
                  }
```
(Ensure `isQueryPlan` is imported in page.tsx — it already is, used by `parseText`.)

- [ ] **Step 4: `page.tsx` — pass `onResult` + use `dismissQuery` in the render block (lines ~593-623).** For `QueryAnswerCard`: add `onResult={handleAnswerResult}` and `onDismiss={dismissQuery}`. For the three list answers, add `onResult={handleAnswerResult}` and `onDismiss={dismissQuery}` (they gain an `onResult` prop in Step 5):
```tsx
{queryPlan && queryPlan.kind === 'query_money' && (
  <QueryAnswerCard userId={user.id} plan={queryPlan} onResult={handleAnswerResult} onDismiss={dismissQuery} />
)}
{queryPlan && queryPlan.kind === 'query_task' && (
  <QueryTaskListAnswer userId={user.id} plan={queryPlan} onResult={handleAnswerResult} onDismiss={dismissQuery} />
)}
{queryPlan && queryPlan.kind === 'query_learning' && (
  <QueryLearningListAnswer userId={user.id} plan={queryPlan} onResult={handleAnswerResult} onDismiss={dismissQuery} />
)}
{queryPlan && queryPlan.kind === 'query_notes' && (
  <QueryNotesListAnswer userId={user.id} plan={queryPlan} onResult={handleAnswerResult} onDismiss={dismissQuery} />
)}
```
Also update any other `setQueryPlan(null)` call sites (e.g. the disabled-input logic uses `queryPlan !== null`, unaffected) to use `dismissQuery` where a user dismiss happens.

- [ ] **Step 5: the 3 list-answer functions in `page.tsx` — add `onResult` + emit.** Each already computes `filtered`. Add `onResult?` to its props and a `useEffect` emitting the count-based `SpokenAnswerInput`. For `QueryTaskListAnswer`:
```typescript
function QueryTaskListAnswer({ userId, plan, onDismiss, onResult }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_task' }>; onDismiss: () => void; onResult?: (i: SpokenAnswerInput) => void }) {
  const allTasks = useTasks(userId, 'all')
  const nowIso = new Date().toISOString()
  const filtered = filterTasksForQuery(allTasks, plan, nowIso)
  useEffect(() => { onResult?.({ kind: 'task', count: filtered.length, status: plan.status }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [plan, filtered.length])
  // …unchanged render…
}
```
`QueryLearningListAnswer`:
```typescript
  useEffect(() => { onResult?.({ kind: 'learning', count: filtered.length, search: plan.search }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [plan, filtered.length])
```
`QueryNotesListAnswer`:
```typescript
  useEffect(() => { onResult?.({ kind: 'notes', count: filtered.length, search: plan.search }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [plan, filtered.length])
```
Add `onResult?: (i: SpokenAnswerInput) => void` to each function's props type. Ensure `useEffect` is imported in page.tsx (it is).

- [ ] **Step 6: gate + commit.** typecheck → lint → test (still passing, count unchanged) → build. Then:
```bash
git add src/components/query-answer-card.tsx src/app/app/page.tsx
git commit -m "feat(voice): route voice queries to the answer slot + speak voice-sourced answers"
```

---

## Task 4: Settings toggle + a11y + QA runbook

**Files:**
- Modify: `src/app/settings/preferences/page.tsx`
- Create: `docs/superpowers/notes/2026-07-21-pulse-voice-queries-qa-runbook.md`

- [ ] **Step 1: "Speak answers aloud" toggle — `src/app/settings/preferences/page.tsx`.** Add a client-only section (localStorage, NOT the server-pref save flow). Import the helpers + `useState`/`useEffect`:
```typescript
import { isVoiceAnswersEnabled, setVoiceAnswersEnabled } from '@/lib/speak'
```
Add local state (initialized from localStorage on mount to avoid SSR mismatch):
```typescript
  const [speakAnswers, setSpeakAnswers] = useState(true)
  useEffect(() => { setSpeakAnswers(isVoiceAnswersEnabled()) }, [])
```
Add a `<section className="glass flex flex-col gap-2 rounded-2xl p-4">` mirroring the existing sections, with a toggle button that flips + persists:
```tsx
  <section className="glass flex flex-col gap-2 rounded-2xl p-4">
    <h2 className="text-sm font-medium">Voice answers</h2>
    <p className="text-xs text-muted-foreground">Read spoken query answers aloud after a voice question.</p>
    <button
      type="button"
      aria-pressed={speakAnswers}
      onClick={() => { const next = !speakAnswers; setSpeakAnswers(next); setVoiceAnswersEnabled(next) }}
      className="glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none w-fit"
    >
      {speakAnswers ? '🔊 Speaking enabled — tap to mute' : '🔇 Muted — tap to enable'}
    </button>
  </section>
```
(This section does NOT set the page's `dirty` flag — it persists immediately to localStorage, independent of the server-prefs Save button.)

- [ ] **Step 2: QA runbook — `docs/superpowers/notes/2026-07-21-pulse-voice-queries-qa-runbook.md`.** Manual checks for the deployed PWA: speak one query per domain (money total/breakdown/delta/series, task overdue, learning about X, notes about Y) → correct on-screen answer + a sensible spoken summary; toggle off in Settings → answers still display but stay silent; a voice `log_*` utterance still shows a confirmation chip (no query misroute + no speech); dismissing an answer mid-speech stops it; on a device without SpeechSynthesis the answer still displays.

- [ ] **Step 3: gate + commit.** typecheck → lint → test → build. Then:
```bash
git add src/app/settings/preferences/page.tsx docs/superpowers/notes/2026-07-21-pulse-voice-queries-qa-runbook.md
git commit -m "feat(voice): Settings toggle for spoken answers + QA runbook"
```

---

## After all tasks

- Whole-branch multi-lens final review (base = `git merge-base main HEAD`): correctness/dead-code (does the voice route actually stream query plans? does `onResult` fire once + speak only for voice? no speech on text queries?), integration-seams (voice payload → `isQueryPlan` → slot → answer → `onResult` → speak, end-to-end), a11y (stop/mute + speech additive), regression (log_* voice + text queries unchanged; no new deps/crons). Lighter than Budgets (no entity_kind, no migration, no router change, no new cron).
- Then `superpowers:finishing-a-development-branch` (merge/deploy = Sheik's call). **No migration, no new cron trigger** — a clean deploy (the 5-cron cap is not touched).
