# Pulse Learning Domain — Design Spec

**Date:** 2026-07-08
**Status:** Approved direction (insight-log loop; multi-tag; topic-filter chronological browse). Ready for implementation plan.
**Scope:** Add the **Learning** domain — the third of the "Big Four" — as a voice-first *insight log*. Additive to the existing sync/agent/UI architecture; no changes to Money, Tasks, auth, or the sync-engine internals.

## Goal

Let the user capture what they learn day-to-day in one gesture: speak or type "today I learned …", a Groq agent cleans the wording and suggests **tags** + a **source**, the user confirms via a chip, and it lands in a browsable, topic-filterable log. This realizes the app's original pitch (a daily learning tracker) using the exact patterns already proven by Money and Tasks.

## The core loop (locked)

Capture (voice/text) → `parse_learning` Groq agent → editable confirmation chip (text + tags + source) → confirm → op-log entry → appears in the Learn tab's log. Browse newest-first; tap a tag to filter.

## Non-goals (YAGNI — deliberately excluded from v1)

- No spaced-repetition / flashcards / review scheduling.
- No digest/push **resurfacing** of past learnings (the Phase-3 insight digest is untouched; a future phase may wire Learning into it).
- No natural-language **query agent** (like `query_money`) — browse + tag-filter only.
- No free-text search in v1 (tag filter + chronological list only).
- No changes to Money/Tasks/auth/cron or the HLC/op-log engine internals.

## Global constraints

- Stack unchanged: Next 16 + React 19 + Tailwind 4 + Dexie v4 + Better Auth + Cloudflare Workers/D1 + custom HLC/op-log sync + Groq (`openai/gpt-oss-120b` for the agent, router on `gpt-oss-20b`). Dark glassmorphism UI (glass utilities, `--accent-2`, mono figures, lucide icons, `<AuroraBackground/>`).
- **Additive only.** New files + additive edits to shared registries (entity-kind list, op-schema switch, Dexie version bump, router intents, tab-bar). Do not alter Money/Task behavior.
- `learning` is **already a registered `entity_kind`** in `src/types/ops.ts` (placeholder from original scoping) — confirm/keep it.
- **No new dependencies.**
- D1 migration applied to remote **by hand** (CI token lacks D1:Edit); CI D1 steps stay `continue-on-error`.
- All tests stay green (baseline 463) and grow; **`pnpm build` in every gate**. Git identity `sdsheikahamed@gmail.com`.
- Detailed file-by-file recipe (exact symbols/paths, mirrored from Money/Tasks) lives in `docs/superpowers/notes/2026-07-08-pulse-domain-blueprint.json` (the 7-agent codebase map) — the implementation plan is derived from it.

## Data model — `learning_entries`

New store, mirroring `money_entries` / `task_entries` (Dexie `LearningRow` + D1 table + Kysely `LearningEntryTable`):

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | PK |
| `user_id` | string | FK → user |
| `text` | string | the cleaned learning statement (required, 1–2000 chars) |
| `tags` | string[] | agent-suggested + user-editable; **stored as a JSON array in one field** |
| `source` | string \| null | *origin* — where it came from (book/article/talk/…), agent-extracted, optional |
| `source_kind` | 'voice' \| 'manual' | *capture method* (mirrors the money/task `source` enum); distinct from `source` above |
| `occurred_at` | string (ISO UTC) | when learned (defaults to capture time) |
| `field_hlcs` | Record<string,string> (TEXT in D1) | per-field HLC |
| `deleted_at` | string \| null | tombstone |
| `created_at` / `updated_at` | string (ISO) | derived from op HLC |

**Multi-tag sync semantics (decided):** `tags` is a single logical field carrying a JSON array; conflicts resolve by **whole-array last-write-wins** (the field's HLC governs the entire array), NOT per-element set-merge. This matches the per-field-LWW engine with zero new machinery. Dexie index includes a **`*tags` multiEntry index** so "filter by tag" is an indexed query.

## Op-schema + registration

- New `src/lib/op-schemas/learning.ts`: `LearningPayloadSchema` = `{ text: z.string().min(1).max(2000), tags: z.array(z.string().min(1).max(40)).max(12).default([]), source: z.string().max(200).nullable().default(null), occurred_at: z.string().datetime(), source_kind: z.enum(['voice','manual']) }` (`.strict()`), + `LearningPayload` type.
- Register in `src/lib/op-schemas/index.ts` (`getPayloadSchemaForKind` switch + type export).

## Agent + router

- New `parse_learning` agent (mirrors the money/task parse agents): prompt turns a raw utterance into `{ text (cleaned, first-person, concise), tags (1–4 suggested), source (if named, else null) }`; `callGroqJSON` with `response_format: json_object` on `openai/gpt-oss-120b`; output **Zod-clamped** against `LearningPayloadSchema` (untrusted model output is data). 
- Register a new intent in the router so the shared voice/text bar classifies "I learned / TIL / note that I learned …" to `parse_learning`. The router must keep money/task/query classification unchanged (add, don't reorder in a way that regresses existing routing — covered by tests).

## Capture + confirmation

- Extend the capture flow (voice-SSE + text) to handle a `learning` draft. Add a **`learning` variant to `<ConfirmationChip>`** (or a sibling chip): shows editable `text`, a tag editor (add/remove chips), and `source`; confirm → `generateOp('learning','create', payload)` → `applyLocalOp` → `pushPullOnce`. Reuses the offline queue / web-lock drain path already in the `/app` shell (no new drain logic).

## UI

- **Tab bar → 3 tabs:** add "Learn" (lucide `BookOpen`) beside Wallet + Tasks. Verify the mobile floating dock + desktop segmented control still lay out cleanly at 3 items (spacing/tap targets).
- **`<LearningList>`** — `glass-soft` rows: the learning `text`, a row of tag pills, `source` + relative date; long-press / menu for edit + delete + undo (mirror `MoneyList`/`TaskList`).
- **Topic filter** — a tag chooser (mirrors `TaskFilter`/`CategoryPicker`) listing distinct tags; selecting one filters the list (indexed via `*tags`).
- **Summary** — a small glass card: learnings this week + top tags (derived from the already-loaded liveQuery data; no new query).
- **`use-learnings` hook** — Dexie `liveQuery` over `learning_entries` (live, sorted by `occurred_at` desc, excluding tombstones), mirroring `use-tasks` / `use-money-entries`.
- Numbers in mono; tags/source styled per the glass system; focus-visible rings; `role`/aria on interactive elements.

## Server sync / materialization

- Extend `src/lib/materialize.ts` to materialize a `learning` op into a `learning_entries` D1 row (idempotent upsert, HLC-ordered) — the same shared function used by `/api/sync` + `/api/admin/backfill`. No route changes.
- New `migrations/0006_learning.sql`: `learning_entries` table (columns above; `tags` + `field_hlcs` as TEXT/JSON; `CHECK`/indices per the money/task migrations; indices on `user_id`, `(user_id, occurred_at)`; app-level tag filtering via Dexie `*tags`). Applied to local + remote D1 by hand.

## Testing & verification

- **Unit (new, mirror existing domain tests):** `LearningPayloadSchema` validation (incl. tag cap, strictness, injection-clamp); `parse_learning` agent parse with Groq **mocked** (happy path + malformed model output clamped); router classifies learning utterances correctly **and still classifies money/task/query correctly** (regression); sync round-trip for a `learning` op (generate → apply → materialize) incl. whole-array `tags` LWW; `use-learnings` selectors / tag-filter logic.
- **Gate every task:** `pnpm typecheck` + `pnpm lint` + `pnpm test` (grows, stays green) + **`pnpm build`**.
- **Manual:** capture a learning by voice on the deployed PWA → confirm chip → appears in Learn tab → tag filter works → syncs across a reload.

## Risks & mitigations

- **Router misclassification** (learning vs a money/task utterance) → add explicit learning examples to the router prompt + regression tests asserting existing intents still route correctly; the confirmation chip lets the user correct before commit.
- **Multi-tag LWW is whole-array** (editing tags on two devices → one wins wholesale) → acceptable for a single primary user; documented; per-element CRDT is a future option, not v1.
- **3-tab layout** on small screens → verify dock spacing / ≥44px targets during the UI task.
- **Agent latency / cost** → same profile as money/task capture (one gpt-oss-120b call per capture); no new budget concern.
- **Migration drift** (remote D1 not applied) → apply `0006` by hand before the feature is used; the app is local-first so client capture works even before the server table exists (materialization catches up), matching the documented Phase-1/2 behavior.
