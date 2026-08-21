# Offline capture fallback — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make capture graceful offline. Voice + receipt already queue-and-drain on reconnect. The gap is the **text natural-language path** and **offline visibility**:
- Offline, `parseText()` does a doomed `fetch('/api/agent')` → catch → opens a **blank money draft** regardless of the active tab, losing the typed text's context.
- There is no global **offline indicator** and no visibility that voice/receipt captures are **queued**.

Fix: when offline, skip the fetch and open a **Manual Add draft for the ACTIVE tab prefilled with the typed text** (no AI, fully local). Add an offline badge and a queued-count indicator.

**Architecture:** Pure client. No route/schema/sync change. Reuses `blankDraftForKind`, the manual-add flow, and the existing Dexie queues.

## Global Constraints

- Client-only. NO route/agent/schema/migration/sync change.
- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green (lint fails deploy; vitest ≠ typecheck). No `Date.now()` in render/useMemo.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app` 200 after.

## Background (current code)

- `src/lib/blank-draft.ts` `blankDraftForKind(kind, primaryCurrency, nowIso): ChipDraft` — blank drafts per tab (money/task/learning/note), source 'manual'.
- `src/components/voice-recorder.tsx`: on no-result WHILE offline (`navigator.onLine === false`), `enqueueVoice(blob)` + "Queued — will retry when online". Receipt path is analogous (`enqueueReceipt`/`receipt_queue`).
- Queues: `db.voice_queue` + `db.receipt_queue` (Dexie), items `{ id, status: 'queued'|'transcribing'|'processing'|'done'|'failed', … }`. Drains fire on the `online` event (see `app/page.tsx` online effects).
- `src/app/app/page.tsx` `parseText()`: fetches `/api/agent`; on success routes by intent; on throw → a blank money draft with `raw_input = text`. `activeTab` is available (`'money'|'tasks'|'learning'|'notes'`). The input header holds VoiceRecorder / ReceiptButton / `+Add` / the text form.

---

### Task 1: pure `manualDraftFromText` + `useOnline` hook

**Files:**
- Create: `src/lib/manual-draft.ts`, `src/lib/manual-draft.test.ts`, `src/hooks/use-online.ts`

**Interfaces (Produces):**
- `manualDraftFromText(kind: 'money'|'task'|'learning'|'note', text: string, primaryCurrency: string, nowIso: string): ChipDraft` — starts from `blankDraftForKind(...)` and prefills the primary text field with the trimmed `text`: money → `description`; task → `title`; learning → `text`; note → `body`. Keep `source: 'manual'`; set `raw_input: text` where the draft has a `raw_input` field (money/task). Amount stays 0 (no AI parsing). Empty/whitespace text → behaves like the blank draft (fields empty).
- `useOnline(): boolean` — SSR-safe (defaults `true` when `navigator` is undefined); subscribes to `window` `online`/`offline` events; returns current `navigator.onLine`. Read the clock/nav only in an effect, not render-body in a way that trips `react-hooks/purity` (initialize state from a function; update via listeners).

- [ ] **Step 1: Failing test** — `src/lib/manual-draft.test.ts`: for each kind, `manualDraftFromText(kind, '  spent 200 on lunch  ', 'INR', NOW)` returns a draft of that kind with the trimmed text in the right field (money.description, task.title, learning.text, note.body), `source:'manual'`, money.amount===0; and an empty-text case yields empty fields. (`NOW` is a fixed ISO string — no `Date.now()`.)
- [ ] **Step 2: Run fail → implement `src/lib/manual-draft.ts`** (import `blankDraftForKind`, spread + set the field) → run pass.
- [ ] **Step 3: Implement `src/hooks/use-online.ts`** (`useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)` + an effect adding/removing `online`/`offline` listeners that `setOnline(navigator.onLine)`).
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test manual-draft` → pass.
- [ ] **Step 5: Commit** — `git add src/lib/manual-draft.ts src/lib/manual-draft.test.ts src/hooks/use-online.ts && git commit -m "feat: pure manualDraftFromText + useOnline hook"`

---

### Task 2: wire offline-aware capture + badges

**Files:**
- Create: `src/hooks/use-queued-count.ts`
- Modify: `src/app/app/page.tsx`

**Interfaces (Produces):**
- `useQueuedCount(): number` — `useLiveQuery` summing `db.voice_queue` + `db.receipt_queue` items whose `status` is `'queued'` or `'failed'` (the not-yet-delivered ones); returns 0 while loading. (Failed items count so a stuck capture is visible.)

- [ ] **Step 1: Implement `src/hooks/use-queued-count.ts`** (two `db.<queue>.where('status').anyOf(['queued','failed']).count()` inside one `useLiveQuery`, summed).
- [ ] **Step 2: Offline-aware `parseText`** in `app/page.tsx`. At the top of `parseText` (after the `!text.trim() || !user` guard), add:
  ```ts
  if (!online) {
    const kind = activeTab === 'tasks' ? 'task' : activeTab === 'learning' ? 'learning' : activeTab === 'notes' ? 'note' : 'money'
    setDraft(manualDraftFromText(kind, text.trim(), prefs.primary_currency ?? 'INR', new Date().toISOString()))
    setText('')
    return
  }
  ```
  where `online = useOnline()` is read at component top. Import `manualDraftFromText` + `useOnline`. (The existing online success/catch logic is untouched — this only short-circuits when offline, avoiding the doomed fetch.)
- [ ] **Step 3: Offline badge + button label.** When `!online`, show a small badge in the input header ("● Offline — captures log manually / queue", muted/amber, `role="status"`). Relabel the text-form submit button to "Add" when offline (it now opens a manual draft, not an AI parse). The Voice/Receipt buttons keep working (they already queue offline).
- [ ] **Step 4: Queued indicator.** Render a small chip near the input when `useQueuedCount() > 0`: `"{n} capture{n===1?'':'s'} pending"` (muted, `aria-live="polite"`), so queued voice/receipt captures are visible until they drain. Tapping is not required.
- [ ] **Step 5: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (full suite + build).
- [ ] **Step 6: Commit** — named files only.

## Self-review

- **Coverage:** offline text capture now opens a prefilled manual draft for the ACTIVE tab (was a blank money draft) = #6 core; offline badge + queued-count give visibility; voice/receipt offline behavior unchanged (already correct). ✓
- **Placeholders:** none — pure helper + hooks specified with signatures; the `parseText` hook + badge/indicator steps name exact files + conditions.
- **Type consistency:** `manualDraftFromText` returns `ChipDraft` (same type `blankDraftForKind` returns, consumed by `setDraft`); `useOnline`/`useQueuedCount` return primitives.

## Post-merge

Verify prod `/app` 200. Owner: toggle airplane mode → typing a line opens a manual entry for the current tab (no spinner/blank-money surprise); an offline badge shows; queued voice/receipt captures show a pending count and drain on reconnect.
