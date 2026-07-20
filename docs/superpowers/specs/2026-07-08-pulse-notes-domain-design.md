# Pulse Notes Domain — Design Spec

**Date:** 2026-07-08
**Status:** Approved direction (verbatim body + AI-suggested title/tags + free-text search). Ready for implementation plan.
**Scope:** Add the **Notes** domain — the fourth and final "Big Four" domain — as voice-first quick capture. Additive; mirrors the shipped **Learning** domain's 8-layer structure. No changes to Money/Tasks/Learning/auth/sync-engine internals.

## Goal

Capture a freeform note in one gesture: speak or type, the note is stored **verbatim** (your exact words), a light Groq agent suggests a **title** + **tags** for organization (without rewriting the body), confirm via a chip, then browse/**search** the notes in a new Notes tab. Notes are distinct from Learning: Learning rewrites your words into a clean insight; Notes preserves them.

## The core loop (locked)

Capture (voice/text) → verbatim transcript becomes the `body` → `parse_note` agent returns `{ title, tags }` (body untouched) → editable confirmation chip (body + title + tags) → confirm → op-log entry → appears in the Notes tab; find via **free-text search** (over title + body) and/or tag filter.

## Non-goals (YAGNI — excluded from v1)

- No rich text / markdown / formatting; the body is plain text.
- No pinning, no folders/notebooks, no note-to-note links, no reminders on notes.
- No NL query agent for notes; retrieval is search + tag filter + chronological.
- No changes to Money/Tasks/Learning/auth/cron or the HLC/op-log engine internals.

## Global constraints

- Stack unchanged: Next 16 + React 19 + Tailwind 4 + Dexie v4 + Better Auth + Cloudflare Workers/D1 + custom HLC/op-log sync + Groq (`openai/gpt-oss-120b` agent, `gpt-oss-20b` router). Dark glassmorphism UI.
- **Additive only.** New files + additive edits to shared registries (entity-kind list, op-schema switch, Dexie version bump, `applyLocalOp` switch + txn list, materialize switch, entity-fields, router intents, tab-bar, `/app` shell, capture routes).
- `note` is **already a registered `entity_kind`** in `src/types/ops.ts` (placeholder) — verify/keep.
- **No new dependencies.**
- D1 migration `0007` applied to remote **by hand** (CI token lacks D1:Edit).
- All tests stay green (baseline **491**) and grow; **`pnpm build` in every gate**. Git identity `sdsheikahamed@gmail.com`.
- **Template:** the shipped Learning domain is the direct reference for every layer. Domain blueprint: `docs/superpowers/notes/2026-07-08-pulse-domain-blueprint.json`.
- **CRITICAL (the Learning-build lesson):** a new entity_kind MUST be wired in BOTH the server materializer (`src/lib/materialize.ts`) AND the client sync path (`src/lib/sync-client.ts` `applyLocalOp` — its `switch` case + its `db.transaction([...])` table list) + `src/lib/entity-fields.ts`. The client `applyLocalOp` step is a first-class plan task, with a client-side round-trip test.

## Data model — `note_entries`

New store, mirroring `learning_entries`:

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | PK |
| `user_id` | string | FK → user |
| `title` | string \| null | AI-suggested, editable; nullable (list falls back to a body preview) |
| `body` | string | the **verbatim** note text (required, 1–10000 chars) — never rewritten by the agent |
| `tags` | string[] | AI-suggested + editable; **one JSON field, whole-array LWW**; Dexie `*tags` multiEntry index |
| `occurred_at` | string (ISO UTC) | capture time |
| `source` | 'voice' \| 'manual' | capture method (matches money/task/learning convention) |
| `field_hlcs` / `deleted_at` / `created_at` / `updated_at` | | standard per-field-LWW sync scaffolding |

## Op-schema + registration

- `src/lib/op-schemas/note.ts`: `NotePayloadSchema = z.object({ title: z.string().max(200).nullable().optional(), body: z.string().min(1).max(10000), tags: z.array(z.string().min(1).max(40)).max(12).default([]), occurred_at: z.string().datetime(), source: z.enum(['voice','manual']) })` (no `.strict()`, matching money/task/learning) + `NotePayload` type. Register in `getPayloadSchemaForKind`.

## Agent + router

- `src/lib/agents/note-agent.ts` `parseNote({ client, text }): Promise<{ title: string | null; tags: string[] }>` — mirrors `learning-agent.ts`. The prompt: given the note text, suggest a concise `title` (≤ ~8 words) + 1–4 `tags`; **do NOT rewrite or return the body** (the caller keeps the verbatim text). `gpt-oss-120b`, `callGroqJSON`, Zod-clamped, injection-safe (input is data).
- `log_note` intent added to `INTENTS`; router prompt gets note examples ("note that…", "jot down…", "make a note…") + disambiguation: "remember to X" → `log_task`; "I learned X" → `log_learning`; a bare statement to record → `log_note`.

## Capture + confirmation

- Capture routes (`/api/agent`, `/api/voice`) handle `log_note` → `parseNote(text)` → payload `{ kind:'note', body: <verbatim text>, title, tags, occurred_at, source }`. **The body is the verbatim input text, not agent output.**
- A `note` variant of `<ConfirmationChip>`: editable **body** textarea (pre-filled verbatim), editable **title** input, tag editor; confirm → `generateOp('note','create', payload)` → `applyLocalOp` → `pushPullOnce`.

## UI

- **Tab bar → 4 tabs:** add "Notes" (lucide `NotebookPen`) after Wallet/Tasks/Learn. Verify the mobile dock + desktop segmented control lay out cleanly at 4 items (≥44px targets; ~quarter width on a phone).
- **`<NotesList>`** — `glass-soft` rows: `title` (or a body preview if no title), a 1–2 line body preview, tag pills, relative date; long-press/menu delete (mirror learning-list).
- **Free-text search** — a debounced search input (client-side, case-insensitive substring over `title` + `body` of the loaded `useNotes()` rows). This is the retrieval primitive for notes (new vs Learning). Combined with the tag filter.
- **`use-notes` hook** — Dexie `liveQuery` over `note_entries` (live, `deleted_at == null`, sorted `occurred_at` desc), mirroring `use-learnings`.
- **`<NotesTagFilter>`** — mirror `learning-tag-filter`.
- Glass system: mono dates, focus-visible rings, aria-labels, ≥44px targets, empty state ("No notes yet — say 'note that…'").

## Server sync / materialization

- Extend `src/lib/materialize.ts` with a `note` case → `materializeRow_LWW(..., 'note_entries', NOTE_FIELDS)`; `tags` JSON-stringified via the same guarded path as learning. Add `NOTE_FIELDS` to `entity-fields.ts`.
- Extend `src/lib/sync-client.ts` `applyLocalOp`: add `case 'note'` (`get → applyOp → note_entries.put`, tags kept as a native array locally) + add `db.note_entries` to the transaction table list.
- New `migrations/0007_note.sql`: `note_entries` table (columns above; `title` nullable TEXT, `body` TEXT NOT NULL, `tags` TEXT DEFAULT '[]', `source` CHECK voice|manual, `field_hlcs` TEXT, indices on `user_id` + `(user_id, occurred_at)`). Kysely `NoteEntryTable` + `DB` union. Applied local + remote by hand.

## Testing & verification

- **Unit (mirror Learning):** `NotePayloadSchema` validation (body required, title nullable, tag cap); `parseNote` agent (Groq mocked; asserts it returns title+tags and does NOT touch body); router classifies note utterances + regression (money/task/learning/query still correct); **client `applyLocalOp` round-trip** for a `note` op (create → `db.note_entries.get` returns row, tags as array; delete tombstones) — the regression guard the Learning build initially missed; server materialize round-trip incl. tags whole-array LWW; the search-filter helper (case-insensitive substring over title+body) as a pure, unit-tested function.
- **Gate every task:** `pnpm typecheck` + `pnpm lint` + `pnpm test` (grows, stays green) + **`pnpm build`**.
- **Manual:** voice-capture a note on the deployed PWA → chip shows verbatim body + AI title + tags → confirm → appears in Notes tab → search finds it by body text → tag filter works → delete works → survives reload (sync). Confirm the 4-tab dock lays out well on the phone.

## Risks & mitigations

- **Client `applyLocalOp` omission** (the Learning Critical) → it is an explicit first-class plan task with a client round-trip test; the multi-lens final review checks it.
- **Router misclassification** (note vs task/learning/chat) → disambiguation examples in the prompt + a regression test; the confirmation chip lets the user correct before commit; deferred live router eval-set (Phase 4) applies here too.
- **Search performance** → client-side substring over the loaded rows is fine at personal scale; if the note count grows large, a Dexie index / windowing is a future optimization (noted, not v1).
- **4-tab dock crowding** on small screens → verify spacing/targets during the UI task; icons + labels must stay legible at quarter width.
- **Migration drift** (remote D1) → apply `0007` by hand before the feature is used; local-first client capture works before the server table exists (materialization catches up).
