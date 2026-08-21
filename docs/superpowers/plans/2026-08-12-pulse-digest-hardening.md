# Digest hardening + all-domain summary — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** (1) make the weekly-digest cron **crash-safe** so a partial failure can never skip a user's week forever; (2) broaden the digest to summarize **all four domains** (add learning + notes; today it only covers money + tasks).

**Architecture:** Server + client display, no schema/migration (metrics is a JSON string column). Enhancement #2 (correctness) + #4 (breadth) from the feature review — both live in the digest/insight subsystem, so one branch.

## Global Constraints

- Client-only where possible; NO migration/sync-contract/entity_kind/cron-count change. `metrics` stays a JSON string in the `insights` row.
- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** — all green (lint fails the deploy otherwise; vitest does not typecheck). ESLint `react-hooks/purity`: no `Date.now()` in render/useMemo.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app` + `/insights` 200 after.

## Background (current code)

- `src/app/api/cron/digest/route.ts`: for each user on their local Monday, computes `opId = insight-weekly-{user}-{weekStart}`, **skips if that `op_log` id exists**, else calls `generateInsight(...)`, then inserts a `push_notifications` row + `sendPushToUser` (best-effort).
- `src/lib/insight-generate.ts` `generateInsight`: aggregates, writes the narrative, **inserts the op_log row (NO onConflict) then `materializeRow`** (op → `insights` projection). `entityId = insight-{user}-{weekStart}`.
- `src/lib/digest-aggregate.ts` `aggregateWeek` → `DigestMetrics` (money spend/income/top_categories + tasks completed/created/overdue). **No learning/notes.**
- `src/lib/agents/digest-agent.ts`: `buildDigestSystemPrompt`, `fallbackSummary`, `writeDigestNarrative` (passes `JSON.stringify(metrics)` to Groq).
- `src/components/insight-card.tsx`: renders summary + Spend/Income/Done/Overdue chips + top categories (detail).
- Tests: `tests/api/cron-digest-route.test.ts`, `tests/lib/digest-aggregate.test.ts` (verify exact names by grep before editing).

**The bug:** idempotency keys on the `op_log` id, but op-insert → materialize is not atomic. Crash between them (or a failed materialize) leaves the op logged but the `insights` projection missing; the next run sees the op id and `continue`s → that week's digest never materializes and no push is sent. **Fix: key idempotency on the deliverable (the `insights` projection row), and make the op-insert idempotent so a re-run safely completes.** The digest cron already fires twice each Monday (2:30 AM + 2:30 PM) — that second tick becomes the recovery window.

---

### Task 1: Crash-safe idempotency (correctness-critical)

**Files:**
- Modify: `src/lib/insight-generate.ts`, `src/app/api/cron/digest/route.ts`
- Test: `tests/api/cron-digest-route.test.ts` (exists — grep to confirm path/shape before editing)

**Interfaces:** `generateInsight` signature UNCHANGED.

- [ ] **Step 1: Make the op-insert idempotent** — `src/lib/insight-generate.ts`, the `db.insertInto('op_log').values({...})` call: add `.onConflict(oc => oc.column('id').doNothing())` before `.execute()`. (So re-running with the same `opId` after a partial failure is a safe no-op instead of a PK throw; materialize still runs and upserts the projection.)

- [ ] **Step 2: Re-key the cron idempotency to the deliverable** — `src/app/api/cron/digest/route.ts`. Replace the op_log existence check (currently `opId` + `SELECT id FROM op_log WHERE id = opId`) with a check on the **`insights` projection row** for the week:

```ts
const weekStart = bounds.startsAt.slice(0, 10)
const entityId = `insight-${user.id}-${weekStart}`
const opId = `insight-weekly-${user.id}-${weekStart}`
// Idempotent on the DELIVERABLE, not the op-log id: only skip once the insight
// projection actually exists. A prior run that logged the op but crashed before
// materialize left no insights row → we (re)generate and complete it (the op
// insert is now onConflict-doNothing, so re-inserting the same opId is safe).
const existingInsight = await db.selectFrom('insights').where('id', '=', entityId).select('id').executeTakeFirst()
if (existingInsight) continue
```

Keep passing `opId` + `opType: 'create'` to `generateInsight` unchanged. (The push block stays; it's best-effort and only runs on a fresh generate.)

- [ ] **Step 3: Extend the route test** — in `tests/api/cron-digest-route.test.ts`, add two cases (adapt to the file's existing fake-DB harness):
  1. **Skips when the insights projection already exists** (fake `insights` table returns a row for `insight-{user}-{weekStart}`) → `generateInsight` not invoked / no new op; response `digests_created` unchanged for that user.
  2. **Recovers a partial failure**: `op_log` already has the `insight-weekly-…` id BUT the `insights` row is missing → the cron STILL generates (does NOT skip) and materializes the insights row. (This is the crash-recovery the fix delivers; the old behavior would have skipped.)
  Keep all existing cases green (the Monday-gate, the empty-week skip, etc.).

- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test cron-digest` → pass.
- [ ] **Step 5: Commit** — `git add src/lib/insight-generate.ts src/app/api/cron/digest/route.ts tests/api/cron-digest-route.test.ts && git commit -m "fix: digest cron idempotent on the insights projection, not the op-log id"`

---

### Task 2: All-domain digest (add learning + notes)

**Files:**
- Modify: `src/lib/digest-aggregate.ts`, `src/lib/insight-generate.ts` (skip guard), `src/lib/agents/digest-agent.ts`, `src/components/insight-card.tsx`
- Test: `tests/lib/digest-aggregate.test.ts` (exists — grep to confirm) + `tests/lib/digest-agent.test.ts` if present

**Interfaces (Produces):** `DigestMetrics` gains three fields:
- `learnings_added: number`
- `notes_added: number`
- `top_learning_tags: string[]` (≤5, most-frequent first)

- [ ] **Step 1: Extend `DigestMetrics` + `aggregateWeek`** — `src/lib/digest-aggregate.ts`. Add the three fields to the type. In `aggregateWeek`, after the task metrics, query the two tables in-window (mirror the money-window filter: `occurred_at >= startsAt && < endsAt`, `deleted_at is null`):

```ts
const learnings = await db.selectFrom('learning_entries').where('user_id', '=', userId)
  .where('occurred_at', '>=', bounds.startsAt).where('occurred_at', '<', bounds.endsAt)
  .where('deleted_at', 'is', null).selectAll().execute()
const notes = await db.selectFrom('note_entries').where('user_id', '=', userId)
  .where('occurred_at', '>=', bounds.startsAt).where('occurred_at', '<', bounds.endsAt)
  .where('deleted_at', 'is', null).selectAll().execute()
// top learning tags (tags is a string[] column)
const tagCounts = new Map<string, number>()
for (const l of learnings) for (const t of (l.tags ?? [])) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
const top_learning_tags = Array.from(tagCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,5).map(([t]) => t)
```

Return `learnings_added: learnings.length`, `notes_added: notes.length`, `top_learning_tags`.

- [ ] **Step 2: Update the empty-week skip guard** — `src/lib/insight-generate.ts` line ~27: the guard currently skips when `entry_count===0 && tasks_created===0 && tasks_completed===0`. Extend so a week with ONLY learnings/notes still generates a digest:

```ts
if (metrics.entry_count === 0 && metrics.tasks_created === 0 && metrics.tasks_completed === 0
    && metrics.learnings_added === 0 && metrics.notes_added === 0) {
  return { skipped: true, insight: null }
}
```

- [ ] **Step 3: Narrative + fallback mention all domains** — `src/lib/agents/digest-agent.ts`:
  - `buildDigestSystemPrompt`: broaden the instruction to "…digest of the week's money, tasks, learning, and notes activity. Mention the biggest spending category, task throughput, and anything learned/noted worth calling out."
  - `fallbackSummary`: append a sentence when there's learning/notes activity, e.g. `` `${m.learnings_added > 0 ? ` You logged ${m.learnings_added} learning${m.learnings_added===1?'':'s'}${m.top_learning_tags.length? ' on '+m.top_learning_tags.slice(0,2).join(', '):''}.` : ''}${m.notes_added > 0 ? ` You captured ${m.notes_added} note${m.notes_added===1?'':'s'}.` : ''}` `` (keep it deterministic; no trailing double-spaces). `writeDigestNarrative` already sends the full metrics JSON, so the new fields flow to Groq automatically.

- [ ] **Step 4: Show it in the card** — `src/components/insight-card.tsx`: add chips when > 0: `{metrics.learnings_added > 0 && <Chip label="Learned" value={String(metrics.learnings_added)} />}` and `{metrics.notes_added > 0 && <Chip label="Notes" value={String(metrics.notes_added)} />}`. In the `detail` variant, if `top_learning_tags.length`, render them as small tag pills under the categories.

- [ ] **Step 5: Update tests** — `tests/lib/digest-aggregate.test.ts`: extend the fake DB to serve `learning_entries` + `note_entries`; assert `learnings_added`/`notes_added` counts (in-window only) + `top_learning_tags` ordering. Add a digest-agent fallback test asserting the learning/notes sentence appears only when counts > 0. Keep existing cases green. **Also** update any existing test that constructs a `DigestMetrics` literal (grep for `entry_count:` / `tasks_overdue:` in tests) to include the three new fields, or TS will fail the build.

- [ ] **Step 6: Gate** `pnpm lint && pnpm typecheck && pnpm test digest && pnpm build` → pass.
- [ ] **Step 7: Commit** — named files only.

---

## Self-review

- **Coverage:** #2 crash-safety = Task 1 (idempotency on `insights` row + onConflict op-insert + recovery test). #4 all-domain = Task 2 (learning+notes counts + top tags in aggregate, skip-guard, prompt, fallback, card, tests). ✓
- **Placeholders:** none — critical code inline; mechanical UI/test steps name exact files + field shapes.
- **Type consistency:** the three new `DigestMetrics` fields are added in Task 2 Step 1 and consumed in Steps 2–5; any existing `DigestMetrics` literal in tests must gain them (Step 5) or `tsc` fails.

## Post-merge

Verify prod `/app` + `/insights` 200. Owner: the next Monday digest tick (or an on-demand `/insights` refresh) now summarizes all four domains; a partial cron failure self-heals on the second Monday tick.
