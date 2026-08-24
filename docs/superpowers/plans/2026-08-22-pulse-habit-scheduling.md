# Habit weekday scheduling — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let a habit be scheduled for specific weekdays (not just daily) — "Gym: Mon/Wed/Fri", "Work journal: weekdays". Non-scheduled days don't break the streak; streaks/rates count only scheduled days.

**Architecture:** Add a `schedule` field to the EXISTING `habit` entity (a new COLUMN — the match_hints/merchant pattern, NOT a new entity), make the pure `habitStreaks` schedule-aware, and add a weekday picker to the habit form + a schedule label + a "due today" treatment. No new entity; no Dexie version bump (unindexed field).

## Design decisions (resolved)

- **`schedule` = comma-separated weekday numbers** (0=Sun … 6=Sat), e.g. `"1,2,3,4,5"` = weekdays, `"1,3,5"` = MWF. **`null`/empty = daily** (every day) — so existing habits are daily by default, zero migration of data.
- **Streak semantics with a schedule:** iterate days backward from today; SKIP non-scheduled days entirely; on a scheduled day: completed → count; not completed → break UNLESS it's today (today-not-yet-done keeps the streak alive up to the last scheduled day). `rate30` = completed scheduled days ÷ scheduled days in the last 30 days.
- **Toggle still allowed on any day** (you can log a habit off-schedule); scheduling only affects streak math + the "due today" UI hint.
- **Deferred:** N-times-per-week goals; per-day targets; reminders; changing the weekday-start (assume 0=Sun indexing from `Date.getUTCDay()` on the calendar day).

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green. No `Date.now()` in render/useMemo.
- `schedule` is a NEW COLUMN on the EXISTING `habit` entity (the match_hints pattern): add `'schedule'` to `HABIT_FIELDS` → generic materialize + generic `applyOp` pick it up (NO materialize/sync-client case change, NO Dexie version bump). Add to `HabitPayloadSchema`, `HabitRow`, db.ts.
- Migration 0022 applied to remote D1 MANUALLY post-merge (`ALTER TABLE habits ADD COLUMN schedule TEXT`; retry a transient error).
- `habitStreaks` gains an OPTIONAL 3rd param `schedule: string | null = null` (default = daily → existing behavior unchanged; existing callers/tests keep working, then callers pass `habit.schedule`).
- Weekday numbering: `0=Sun … 6=Sat`, derived from the calendar day via `new Date(dayStr + 'T00:00:00Z').getUTCDay()` (pure, clock-free).
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/habits`, `/dashboard` 200. **Whole-branch review** (a field add + a change to shipped streak logic that 4 call-sites depend on): confirm daily habits behave EXACTLY as before (schedule null), scheduled streaks skip non-scheduled days correctly, and the field round-trips.

## Reference (mirror exactly)

- **Field-add-to-existing-entity:** `match_hints` on account (migration 0020, `ACCOUNT_FIELDS += 'match_hints'`, AccountPayloadSchema, AccountRow, db.ts — no case/version change). Do the same shape for `schedule` on habit.
- `src/lib/habits.ts` `habitStreaks` (the fn to extend) + its `addDays`; `src/app/habits/page.tsx` (2 calls + the create/edit form) + `src/components/dashboard/habits-widget.tsx` (2 calls).

---

### Task 1: `schedule` field on habit

**Files:**
- Create: `migrations/0022_habit_schedule.sql`
- Modify: `src/lib/entity-fields.ts`, `src/lib/op-schemas/habit.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`
- Test: extend the habit round-trip test

**Interfaces (Produces):**
- `HabitPayloadSchema` gains `schedule: z.string().max(40).nullable().optional()`.
- `HabitRow` gains `schedule: string | null`.
- `HABIT_FIELDS` gains `'schedule'`.

- [ ] **Step 1: Migration** `migrations/0022_habit_schedule.sql`: `ALTER TABLE habits ADD COLUMN schedule TEXT;`
- [ ] **Step 2:** `entity-fields.ts` — append `'schedule'` to `HABIT_FIELDS`.
- [ ] **Step 3:** `op-schemas/habit.ts` — add `schedule` (string ≤40, nullable, optional) to `HabitPayloadSchema`.
- [ ] **Step 4:** `dexie.ts` — add `schedule: string | null` to `HabitRow` (NO version bump — unindexed field).
- [ ] **Step 5:** `db.ts` — add `schedule: string | null` to the Kysely habits interface.
- [ ] **Step 6: Test** — extend the habit round-trip test: a `habit` create with `schedule: '1,2,3,4,5'` materializes it both sides; an update changing only `schedule` leaves `name` (per-field LWW). Grep tests for `HabitRow`/`HabitPayload` literals that must typecheck.
- [ ] **Step 7: Gate** `pnpm lint && pnpm typecheck && pnpm test habit materialize sync && pnpm build` → pass. **Step 8: Commit** named files.

---

### Task 2: schedule-aware `habitStreaks`

**Files:** Modify `src/lib/habits.ts`; extend `src/lib/habits.test.ts`

**Interfaces (Produces / changes):**
- `parseSchedule(schedule: string | null | undefined): Set<number> | null` — null/empty/whitespace → `null` (daily); else parse comma-separated ints, keep 0–6, dedup → a Set (empty after parse → treat as null/daily). Exported.
- `isScheduledOn(schedule: string | null | undefined, dayStr: string): boolean` — `parseSchedule` null → true (daily); else `set.has(new Date(dayStr+'T00:00:00Z').getUTCDay())`. Exported.
- `HabitStreaks` gains `dueToday: boolean`.
- `habitStreaks(days: string[], today: string, schedule: string | null = null): HabitStreaks`:
  - `dueToday = isScheduledOn(schedule, today)`.
  - `completedToday = set.has(today)` (unchanged).
  - **current:** walk backward from `today` up to a safety bound (e.g. 400 iterations): if the day is not scheduled → skip (continue backward, don't count, don't break); if scheduled: if `set.has(day)` → count++; else if `day === today` → skip (today not done yet doesn't break); else → break. Stop at the bound.
  - **longest:** the longest run of consecutive SCHEDULED days that are all completed (walk the calendar; a non-scheduled day is neutral/skipped — it neither extends nor breaks; a scheduled-but-missing day breaks the run). Implementation: from the earliest completed day to today, step day by day; track a running count of consecutive scheduled-and-completed days, resetting on a scheduled-and-missing day, ignoring non-scheduled days. (For the daily case this equals the old longest.)
  - **rate30:** over the inclusive window [today-29 … today], `scheduledDays` = days in the window that are scheduled; `completed` = those also in the set; `rate30 = scheduledDays === 0 ? 0 : completed / scheduledDays`. (Daily case: scheduledDays = 30, matches the old rate.)
  - Pure; no mutation.

- [ ] **Step 1: Failing tests** in `habits.test.ts` (fixed `today`), covering BOTH the unchanged daily path AND schedule:
  - **Regression:** all existing daily calls (schedule omitted/null) return the SAME current/longest/rate30 as before + `dueToday: true`.
  - a MWF schedule (`'1,3,5'`): completed the last several M/W/F → `current` counts them; a skipped weekend (Sat/Sun not scheduled) between Fri and Mon does NOT break the streak.
  - a scheduled day missed (e.g. missed Wednesday) → breaks current at that point.
  - `dueToday` true only when today's weekday ∈ schedule; a non-scheduled today with the prior scheduled day done → streak still "current" (today not due).
  - `rate30` with a weekday schedule = completed-scheduled ÷ scheduled-in-window (not ÷30).
  - `parseSchedule`/`isScheduledOn` units: null→daily/true; `'1,3,5'`→{1,3,5}; junk/out-of-range filtered; a known date's getUTCDay maps to the right weekday.
- [ ] **Step 2: Run fail → implement** in `habits.ts` → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test habits` → pass. **Step 4: Commit** named files.

---

### Task 3: schedule picker + display

**Files:** Modify `src/app/habits/page.tsx`, `src/components/dashboard/habits-widget.tsx`

- [ ] **Step 1: page create/edit form** — add a schedule control: a "Daily" checkbox (default checked); when unchecked, show 7 weekday toggle chips (S M T W T F S = 0..6) to select days. Serialize: Daily → `schedule: null`; else `schedule: ` the selected weekday numbers joined by `,` (sorted). Include `schedule` in the create AND edit `habit` op payloads. Pre-fill the edit form from `habit.schedule` (parse via `parseSchedule`). If "not daily" but zero chips selected, treat as daily (null) / block submit — pick one and be consistent (treat as daily).
- [ ] **Step 2: page display** — pass `habit.schedule` to BOTH `habitStreaks(days, todayStr, habit.schedule)` calls. On each habit row show a small schedule label: daily → "Daily"; else the weekday abbreviations (e.g. "Mon Wed Fri") from `parseSchedule`. When `!s.dueToday`, show a muted "not due today" hint and de-emphasize the toggle (still allow it).
- [ ] **Step 2b: widget** — pass `habit.schedule` to BOTH `habitStreaks(...)` calls in `habits-widget.tsx`; optionally show only-due-today first or a small "not due" dim. Minimum: pass the schedule so streaks are correct.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /habits + /dashboard). **Step 4: Commit** named files.

## Self-review

- **Coverage:** schedule field both-sides + migration (T1) · schedule-aware streak math with a daily-regression guard (T2) · weekday picker + schedule label + due-today hint, streaks passed schedule at all 4 call-sites (T3). N-per-week/reminders deferred. ✓
- **Placeholders:** none — migration + field exact; streak semantics + parse helpers + test cases explicit; UI control + serialization named.
- **Type consistency:** `schedule` on `HabitPayloadSchema`/`HabitRow`/`HABIT_FIELDS`/db.ts (T1); `parseSchedule`/`isScheduledOn`/`habitStreaks(…, schedule)`/`dueToday` (T2) consumed by page + widget (T3).
- **Guards:** schedule null = daily (data-migration-free, existing behavior preserved — regression-tested); out-of-range/junk weekday tokens filtered; empty selection = daily; non-scheduled days neither break nor count; rate30 divides by scheduled-in-window (no /0 — guarded).

## Post-merge (owner)

Apply migration 0022 to remote D1 (`ALTER TABLE habits ADD COLUMN schedule TEXT`; retry transient) + verify. Then in `/habits`, set a habit's schedule (e.g. Gym → Mon/Wed/Fri) — weekends won't break the streak, and the 30-day rate counts only scheduled days.
