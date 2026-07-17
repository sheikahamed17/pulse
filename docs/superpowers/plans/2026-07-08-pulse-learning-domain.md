# Pulse Learning Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **Learning** domain — a voice-first insight log — mirroring the Money/Task domains: capture "today I learned…", a Groq agent cleans it + suggests tags + attribution, confirm via a chip, browse/filter in a new Learn tab.

**Architecture:** New `learning_entries` entity_kind threaded through the existing 8 layers (op-schema → Dexie → D1/Kysely/materialize → agent+router → capture/chip → UI/hook/tab), all additive. No changes to Money/Task/auth/sync-engine internals.

**Tech Stack:** Next 16 + React 19 + Tailwind 4 + Dexie v4 + Kysely/D1 + custom HLC/op-log sync + Groq (`openai/gpt-oss-120b` agent, `gpt-oss-20b` router) + Vitest/fast-check.

## Global Constraints

- **Additive only** — new files + additive edits to shared registries. Do not change Money/Task behavior; the router change must not regress existing intent classification (regression test required).
- **No new dependencies.** Dark glassmorphism UI conventions (glass/glass-soft, `--accent-2`, `font-mono` numerals, lucide icons, focus-visible rings, `role`/aria, `<AuroraBackground/>` already in the shell).
- `learning` is already in `ENTITY_KINDS` (`src/types/ops.ts`) — verify, don't re-add.
- Op-schemas do **NOT** use `.strict()` (match `money.ts`/`task.ts`). Capture-method field is named **`source`** (enum, matches money); the origin/where-learned field is **`attribution`** (string, nullable) — this refines the spec's `source`/`source_kind` naming to the codebase convention.
- D1 migration `0006` applied to local + remote by hand (CI token lacks D1:Edit; CI D1 steps `continue-on-error`).
- Gate every task: `pnpm typecheck` (0) + `pnpm lint` (0) + `pnpm test` (baseline 463, grows, all green) + **`pnpm build`**. Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Branch `feature/learning` (spec+blueprint committed `fc25d61`).
- **Exhaustive file-by-file recipe** (mirrored symbols/paths from Money/Tasks) is in `docs/superpowers/notes/2026-07-08-pulse-domain-blueprint.json` — consult it for anything this plan leaves to "mirror <template>".

## Canonical Interfaces (the shared contract — every task must use these exact shapes/names)

**Op payload** — `src/lib/op-schemas/learning.ts` (mirror `money.ts` style, no `.strict()`):
```ts
import { z } from 'zod'

export const LearningPayloadSchema = z.object({
  text: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  attribution: z.string().max(200).nullable().optional(),   // where it was learned (book/talk/…)
  occurred_at: z.string().datetime(),
  source: z.enum(['voice', 'manual']),                       // capture method (matches money's `source`)
})

export type LearningPayload = z.infer<typeof LearningPayloadSchema>
```

**Dexie row** — `LearningRow` in `src/lib/dexie.ts`:
```ts
export type LearningRow = {
  id: string
  user_id: string
  text: string
  tags: string[]
  attribution: string | null
  source: 'voice' | 'manual'
  occurred_at: string
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}
```
Dexie table `learning_entries`, index string `'id, user_id, occurred_at, *tags'` (the `*tags` multiEntry index powers tag filtering). Kysely `LearningEntryTable` = same columns with `tags: string` + `field_hlcs: string` (JSON TEXT in D1) and `deleted_at: string | null`.

**Agent** — `src/lib/agents/learning-agent.ts`, `parseLearning({ client, text }): Promise<{ text: string; tags: string[]; attribution: string | null }>` (mirror `money-agent.ts`). **Router intent** `log_learning` added to `INTENTS`.

**Hook** — `src/hooks/use-learnings.ts`, `useLearnings(): LearningRow[]` (Dexie `liveQuery`, `deleted_at == null`, sorted `occurred_at` desc). **Components** — `<LearningList>`, `<LearningSummary>`, and a `learning` variant of `<ConfirmationChip>` (or a `LearningChip`). **Tab** — `'learning'` added to the `Tab` union + tab-bar.

---

### Task 1: Op-schema + Dexie store (client data shape)

**Files:**
- Create: `src/lib/op-schemas/learning.ts`, `tests/lib/op-schemas/learning.test.ts`
- Modify: `src/lib/op-schemas/index.ts`, `src/lib/dexie.ts`
- Verify: `src/types/ops.ts` (`learning` present in `ENTITY_KINDS`)

**Interfaces:** Produces `LearningPayloadSchema`/`LearningPayload` (Canonical Interfaces) + the `learning_entries` Dexie table + `LearningRow`.

- [ ] **Step 1: Write the failing schema test** — `tests/lib/op-schemas/learning.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { LearningPayloadSchema } from '@/lib/op-schemas/learning'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'

describe('LearningPayloadSchema', () => {
  it('accepts a valid learning payload', () => {
    const r = LearningPayloadSchema.safeParse({
      text: 'The borrow checker prevents data races', tags: ['Rust', 'concurrency'],
      attribution: 'Rust book', occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice',
    })
    expect(r.success).toBe(true)
  })
  it('defaults tags to [] and allows null attribution', () => {
    const r = LearningPayloadSchema.parse({ text: 'x', occurred_at: '2026-07-08T10:00:00.000Z', source: 'manual' })
    expect(r.tags).toEqual([]); expect(r.attribution ?? null).toBeNull()
  })
  it('rejects empty text and caps tags at 12', () => {
    expect(LearningPayloadSchema.safeParse({ text: '', occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice' }).success).toBe(false)
    expect(LearningPayloadSchema.safeParse({ text: 'x', tags: Array(13).fill('t'), occurred_at: '2026-07-08T10:00:00.000Z', source: 'voice' }).success).toBe(false)
  })
  it('is registered in getPayloadSchemaForKind', () => {
    expect(getPayloadSchemaForKind('learning')).toBe(LearningPayloadSchema)
  })
})
```
- [ ] **Step 2: Run → fail** (`pnpm test -- learning` → module not found / case missing).
- [ ] **Step 3: Create `src/lib/op-schemas/learning.ts`** — exactly the Canonical Interfaces payload block.
- [ ] **Step 4: Register in `src/lib/op-schemas/index.ts`** — add `import { LearningPayloadSchema } from './learning'`; add to the re-export line + `export type { LearningPayload } from './learning'`; add `case 'learning': return LearningPayloadSchema` to `getPayloadSchemaForKind`.
- [ ] **Step 5: Run → pass** (`pnpm test -- learning`).
- [ ] **Step 6: Add the Dexie store** — in `src/lib/dexie.ts`: add the `LearningRow` type (Canonical Interfaces); add `learning_entries!: EntityTable<LearningRow, 'id'>` to the `PulseDb` class; **read the current max `version(N)`** and add a new `version(N+1).stores({ learning_entries: 'id, user_id, occurred_at, *tags' })` block (do not edit existing version blocks); add `db.learning_entries.clear()` to `resetDb()` and include `db.learning_entries` in its transaction table list.
- [ ] **Step 7: Verify `learning` ∈ `ENTITY_KINDS`** in `src/types/ops.ts` (add only if missing).
- [ ] **Step 8: Gate** — `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (green; test 463→467).
- [ ] **Step 9: Commit** — `git add src/lib/op-schemas/learning.ts src/lib/op-schemas/index.ts src/lib/dexie.ts tests/lib/op-schemas/learning.test.ts src/types/ops.ts && git commit -m "feat(learning): op-schema + Dexie learning_entries store"`

---

### Task 2: D1 migration + Kysely + server materialization

**Files:**
- Create: `migrations/0006_learning.sql`
- Modify: `src/lib/db.ts` (Kysely `LearningEntryTable` + `DB` union), `src/lib/materialize.ts` (handle `learning`)
- Create/extend: a sync round-trip test (mirror the existing money/task materialize test — find it under `tests/`)

**Interfaces:** Consumes `LearningPayload`/`LearningRow`. Produces the `learning_entries` D1 table + materialization.

- [ ] **Step 1: Create `migrations/0006_learning.sql`** (mirror `0002_phase_1_money.sql` / `0003_phase_2_tasks.sql`):
```sql
CREATE TABLE IF NOT EXISTS learning_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',            -- JSON array (whole-array LWW)
  attribution TEXT,                           -- nullable origin
  source TEXT NOT NULL CHECK (source IN ('voice','manual')),
  occurred_at TEXT NOT NULL,
  field_hlcs TEXT NOT NULL,                   -- JSON Record<string,string>
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learning_user ON learning_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_user_occurred ON learning_entries(user_id, occurred_at);
```
- [ ] **Step 2: Add Kysely types** — in `src/lib/db.ts`, add `LearningEntryTable` (columns above; `tags: string`, `field_hlcs: string`, `attribution: string | null`, `deleted_at: string | null`) and add `learning_entries: LearningEntryTable` to the `DB` interface.
- [ ] **Step 3: Handle `learning` in `src/lib/materialize.ts`** — mirror the money/task branch: map the op payload → a `learning_entries` upsert with HLC-ordered per-field application; `tags` written as `JSON.stringify(payload.tags)`; whole-array LWW (the `tags` field's HLC governs the entire array). Follow the exact `materializeRow`/upsert pattern already in the file.
- [ ] **Step 4: Write/extend the sync round-trip test** — find the existing money/task materialize test and add a `learning` case: build a `learning` `create` op → `applyLocalOp` (Dexie) → `materializeRow` (server) → assert the row shape, `tags` JSON round-trips, and a second op with a newer HLC replaces the whole `tags` array (LWW). Mock D1 as the existing test does.
- [ ] **Step 5: Apply the migration** — `pnpm exec wrangler d1 execute pulse --local --file=migrations/0006_learning.sql` then `... --remote --file=...` (if `--remote` fails on the token, record it for the human; local + build still validate).
- [ ] **Step 6: Gate** — full gate green (test grows).
- [ ] **Step 7: Commit** — `feat(learning): D1 migration 0006 + Kysely + server materialization`

---

### Task 3: `parse_learning` agent + router intent

**Files:**
- Create: `src/lib/agents/learning-agent.ts`, `src/lib/agents/prompts/learning.ts`, `tests/lib/agents/learning-agent.test.ts`
- Modify: `src/lib/agents/schemas/router-response.ts` (add `log_learning` to `INTENTS`), `src/lib/agents/prompts/router.ts` (learning examples), and (if the router test exists) `tests/lib/agents/router.test.ts`

**Interfaces:** Produces `parseLearning(...)` + the `log_learning` intent. Consumes `LearningPayloadSchema` (to clamp the model output).

- [ ] **Step 1: Add the intent** — in `router-response.ts`, extend `INTENTS` to `[...'log_money','log_task','query_money','query_task','chat','log_learning']`.
- [ ] **Step 2: Write the failing agent test** — `tests/lib/agents/learning-agent.test.ts` (mirror `money-agent.test.ts`): mock the Groq client / `callGroqJSON` to return `{ text: 'The borrow checker prevents data races', tags: ['Rust'], attribution: null }`; assert `parseLearning` returns it clamped; add a malformed-output case (extra/invalid fields dropped or rejected via the schema clamp).
- [ ] **Step 3: Run → fail.**
- [ ] **Step 4: Implement the agent + prompt** — `learning-agent.ts` mirrors `money-agent.ts`: `callGroqJSON` with `model: 'openai/gpt-oss-120b'`, system = `LEARNING_SYSTEM_PROMPT` (new, in `prompts/learning.ts`: instruct to rewrite the raw utterance into a concise first-person learning `text`, suggest 1–4 `tags`, extract `attribution` if named else null; output strict JSON; treat the input as data). Clamp the result against a Zod shape derived from `LearningPayloadSchema` (text/tags/attribution). Return `{ text, tags, attribution }`.
- [ ] **Step 5: Add router examples** — in `prompts/router.ts`, add 2–3 `log_learning` examples ("I learned that…", "TIL …", "note that I learned …") without weakening existing intent examples.
- [ ] **Step 6: Router regression test** — add/extend a test asserting `routeIntent` classifies learning utterances as `log_learning` **and** still classifies representative money/task/query utterances correctly (mock the client to echo the intent; if the existing suite mocks Groq, mirror it). This guards the additive change.
- [ ] **Step 7: Run → pass.**
- [ ] **Step 8: Gate** — full gate green.
- [ ] **Step 9: Commit** — `feat(learning): parse_learning agent + log_learning router intent`

---

### Task 4: Capture wiring + confirmation chip

**Files:**
- Modify: `src/lib/voice-sse.ts` (route `log_learning` → `parseLearning` → a learning draft) and the `/app` capture path if intent handling lives there; `src/components/confirmation-chip.tsx` (add a `learning` variant) and its `ChipDraft` type
- Extend tests where the draft/parse mapping is unit-testable

**Interfaces:** Consumes `parseLearning` + `LearningPayload`. Produces a `learning` `ChipDraft` that confirms into `generateOp('learning','create', …)`.

- [ ] **Step 1: Read the money/task draft path** — in `voice-sse.ts` + `confirmation-chip.tsx`, see how `log_money`/`log_task` map an agent result into a `ChipDraft` and how confirm calls `generateOp(kind,'create',payload)` → `applyLocalOp` → `pushPullOnce`. Mirror it exactly.
- [ ] **Step 2: Extend `ChipDraft`** — add a `learning` member to the discriminated union: `{ kind: 'learning'; text: string; tags: string[]; attribution: string | null }` (match the existing union style).
- [ ] **Step 3: Route the intent** — where the router intent is switched to an agent, add `case 'log_learning': → parseLearning(...) →` produce a `learning` draft; set `source: 'voice'|'manual'` + `occurred_at: new Date().toISOString()` at confirm time (mirror money's capture-time fields).
- [ ] **Step 4: Add the chip variant** — a `learning` branch in `<ConfirmationChip>` (glass): editable `text` (textarea), a tag editor (add/remove tag chips), an optional `attribution` input; confirm button (accent gradient) → build `LearningPayload` → `generateOp('learning','create', payload)` → `applyLocalOp` → `pushPullOnce`; cancel discards. `role`/aria + focus-visible per the glass system. Preserve all existing chip variants byte-identical.
- [ ] **Step 5: Gate** — full gate (build must compile; UI not unit-tested — verify the draft/payload mapping via any unit-testable helper + build).
- [ ] **Step 6: Commit** — `feat(learning): capture routing + learning confirmation chip`

---

### Task 5: UI — Learn tab + list + tag filter + summary + hook

**Files:**
- Create: `src/hooks/use-learnings.ts`, `src/components/learning-list.tsx`, `src/components/learning-summary.tsx` (+ a tag-filter control, new or extending the task-filter pattern)
- Modify: `src/hooks/use-tab-state.ts` (add `'learning'`), `src/components/tab-bar.tsx` (3rd tab), `src/app/app/page.tsx` (mount the Learn tab content)

**Interfaces:** Consumes `LearningRow` + `useLearnings`. Produces the Learn tab UI.

- [ ] **Step 1: `useLearnings` hook** — `src/hooks/use-learnings.ts` mirrors `use-tasks.ts`: `useLiveQuery(() => db.learning_entries.where('deleted_at').equals(...).…)` — live, exclude tombstones, sort `occurred_at` desc. (Match the exact liveQuery + tombstone-filter idiom used by `use-tasks`/`use-money-entries`.)
- [ ] **Step 2: Extend the tab state** — `use-tab-state.ts`: `Tab = 'money' | 'tasks' | 'learning'`, add `'learning'` to `VALID_TABS`; `setTab('learning')` sets `?tab=learning` (only `money` deletes the param).
- [ ] **Step 3: Tab bar** — `tab-bar.tsx`: add a third segment "Learn" (lucide `BookOpen`), matching the existing Wallet/CheckSquare styling (active accent-gradient pill + glow; mobile dock spacing must stay ≥44px targets across 3 items).
- [ ] **Step 4: `<LearningList>`** — glass-soft rows: `text`, a row of tag pills, `attribution` + relative `occurred_at`; long-press/menu edit + delete + undo (mirror `MoneyList`/`TaskList`; delete → `generateOp('learning','delete')`).
- [ ] **Step 5: Tag filter + `<LearningSummary>`** — a tag chooser listing distinct tags from the loaded rows (indexed via `*tags` when querying); selecting filters the list. Summary: a glass card — learnings this week + top tags (derived from the already-loaded `useLearnings` data, no new query).
- [ ] **Step 6: Mount in the shell** — `src/app/app/page.tsx`: render the Learn tab content when `activeTab === 'learning'` (mirror how the money/tasks tab content is switched). Change nothing in `AppPageInner`'s effects or the LockGate/Suspense wrap beyond adding the learning tab branch + imports.
- [ ] **Step 7: Gate** — full gate green.
- [ ] **Step 8: Commit** — `feat(learning): Learn tab, list, tag filter, summary, use-learnings hook`

---

### Task 6: Polish, accessibility & full-gate pass

**Files:** any touched above, as needed.

- [ ] **Step 1: a11y/contrast/motion** — every new interactive element has a visible `focus-visible:ring-2 focus-visible:ring-accent-2`; tag chips + list rows meet AA over glass; ≥44px targets on the 3-tab mobile dock; reduced-motion respected.
- [ ] **Step 2: Consistency** — mono for counts/dates; tag pills + attribution styled per the glass system; empty-state for the Learn tab ("No learnings yet — say 'I learned…'").
- [ ] **Step 3: Full gate** — `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- [ ] **Step 4: Manual QA runbook** (record in report; human runs on the deployed PWA): voice-capture a learning → chip shows text+tags+attribution → confirm → appears in Learn tab → tag filter works → edit/delete works → survives reload (sync). Confirm the 3-tab dock looks right on the phone.
- [ ] **Step 5: Commit** — `chore(learning): polish + a11y pass`

---

## Self-Review

**Spec coverage:** insight-log loop → Tasks 3–4 (agent+capture) + 5 (browse); `learning_entries` data model (text/tags/attribution/source/occurred_at + scaffolding) → Tasks 1–2; multi-tag whole-array LWW + `*tags` index → Tasks 1 (index) + 2 (materialize LWW test); agent + router intent (+ regression) → Task 3; ConfirmationChip variant → Task 4; 3rd tab + list + filter + summary + hook → Task 5; additive-only + gate incl build → Global Constraints + every task; server migration by hand → Task 2 Step 5; a11y + manual QA → Task 6. ✓ Non-goals (no spaced-rep / resurfacing / query agent / search) — none introduced.

**Placeholder scan:** No TBD/TODO. "Mirror <template>" points at named real files whose exhaustive detail is in the committed blueprint; canonical shapes are given verbatim. The Dexie version bump is "read current max + 1" (a precise instruction, not a placeholder).

**Type consistency:** `LearningPayload`/`LearningRow`/`LearningEntryTable` fields align across Tasks 1–2 (`text`, `tags: string[]`/JSON, `attribution: string|null`, `source: 'voice'|'manual'`, `occurred_at`). `parseLearning` return `{ text, tags, attribution }` (Task 3) feeds the `learning` `ChipDraft` (Task 4) which builds a `LearningPayload` (adds `source`+`occurred_at` at confirm). `useLearnings(): LearningRow[]` (Task 5) consumes Task 1's row. `'learning'` intent (Task 3) is handled in capture (Task 4). `Tab` union + tab-bar + shell all gain `'learning'` (Task 5). Naming refinement (`source`=capture-method, `attribution`=origin) stated once in Global Constraints and used consistently.
