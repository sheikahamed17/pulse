# Habits & streaks — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A 5th life-OS domain: track daily habits, check them off, and see streaks. Immediate in-app value with zero setup — no accounts/push/AI needed.

**Architecture:** Two new persisted entity kinds — `habit` (the definition) + `habit_log` (a per-day completion) — following the account/goal/transfer pattern (both-sides sync + a Dexie version bump + migration). Streaks are DERIVED (pure). Surfaced as a standalone `/habits` page (linked from the `/app` header) + a dashboard `habits` widget. **v1 = DAILY habits only** — no weekday scheduling, and NOT wired into the `/app` tab-bar or the voice/NL capture router (both deferred to keep scope contained).

## Design decisions (resolved)

- **Two entities, not one:** `habit` = { name, icon, is_archived }; `habit_log` = { habit_id, day } (a completion for one YYYY-MM-DD). A per-day log entity (not an array on the habit) keeps sync clean — a growing array under per-field LWW merges badly, whereas append-only log ops are idempotent.
- **Deterministic log id `hlog-{habit_id}-{day}`** ⇒ checking off is idempotent (re-check = no-op) and un-checking = a `delete` op on that id. Toggle = create-or-delete.
- **Streaks derived** (pure `habitStreaks`) from a habit's completion day-set + today (in the user's tz). Never stored.
- **v1 scope:** daily habits; check-off toggle; current + longest streak; 30-day completion rate. **Deferred:** weekday/N-per-week scheduling, reminders/push, voice/NL capture, a 5th `/app` tab, per-habit target counts, notes on a check-in.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green. No `Date.now()` in render/useMemo (`new Date().getTime()` in a memo; compute "today" in the user's tz via `toLocaleDateString('en-CA', { timeZone: tz })` like the today-tasks widget).
- TWO new `entity_kind`s (`habit`, `habit_log`) each require ALL of (mirror `account`): op-schema, FIELDS const, Dexie Row + a SINGLE `this.version(13).stores({ habits: 'id, user_id', habit_logs: 'id, user_id, [user_id+day]' })` adding BOTH tables + `resetDb` clears, `db.ts` type, `materialize.ts` case (+ tableName union), `sync-client.ts` applyLocalOp case + the Dexie transaction table list, ops-union. Round-trip test BOTH kinds.
- Migration 0021 (habits + habit_logs tables) applied to remote D1 MANUALLY post-merge — DDL one stmt at a time; retry a transient "Cloudflare API failed".
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/app`, `/dashboard`, `/habits` 200. **Whole-branch opus review** (TWO new entity kinds + migration + sync-core): both-sides persistence for both kinds, the toggle create/delete idempotency, streak correctness across tz/gaps, empty states.

## Reference (mirror exactly)

- **Account/goal/transfer entities** (the mirrors): op-schemas/account.ts, ACCOUNT_FIELDS, `materialize.ts case 'account'`, `sync-client.ts case 'account'` + txn list, AccountRow + `this.version(10)`, migration 0017. Settings pages (`settings/accounts/page.tsx`) for CRUD shell; widget pattern (`dashboard/accounts-widget.tsx` + `widget-card.tsx` + `widgets.ts`).
- tz "today": `today-tasks-widget.tsx` `localDay(ms, tz)` via `toLocaleDateString('en-CA', { timeZone: tz })`.
- `/app` header links (dashboard/settings) at `src/app/app/page.tsx` ~line 721 — add a Habits link there.

---

### Task 1: `habit` + `habit_log` entities (both sides)

**Files:**
- Create: `migrations/0021_habits.sql`, `src/lib/op-schemas/habit.ts`, `src/lib/op-schemas/habit-log.ts`
- Modify: `src/lib/entity-fields.ts`, `src/lib/dexie.ts`, `src/lib/db.ts`, `src/lib/materialize.ts`, `src/lib/sync-client.ts`, `src/types/ops.ts` (add both kinds to the entity_kind enum/union)
- Test: extend the sync/materialize round-trip tests for both kinds

**Interfaces (Produces):**
- `HabitPayloadSchema`: `name` (string 1–40), `icon` (string ≤8 nullable optional), `is_archived` (0|1 optional). `HabitLogPayloadSchema`: `habit_id` (string min1), `day` (string, YYYY-MM-DD — `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`).
- `HabitRow` = `{ id, user_id, name, icon: string|null, is_archived: number, field_hlcs, deleted_at, created_at, updated_at }`; `HabitLogRow` = `{ id, user_id, habit_id: string, day: string, field_hlcs, deleted_at, created_at, updated_at }`.
- `HABIT_FIELDS = ['name','icon','is_archived'] as const`; `HABIT_LOG_FIELDS = ['habit_id','day'] as const`.

- [ ] **Step 1: Migration** `migrations/0021_habits.sql` (apply later as SEPARATE `--command`s):
```sql
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  habit_id TEXT NOT NULL,
  day TEXT NOT NULL,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user ON habit_logs(user_id);
```
- [ ] **Step 2:** op-schemas `habit.ts` + `habit-log.ts` (mirror account.ts).
- [ ] **Step 3:** entity-fields `HABIT_FIELDS` + `HABIT_LOG_FIELDS`.
- [ ] **Step 4:** dexie `HabitRow` + `HabitLogRow`; tables `habits!`/`habit_logs!`; `this.version(13).stores({ habits: 'id, user_id', habit_logs: 'id, user_id, [user_id+day]' })` (NEW version, adds BOTH); `db.habits.clear()` + `db.habit_logs.clear()` in resetDb.
- [ ] **Step 5:** db.ts Kysely `habits` + `habit_logs` interfaces.
- [ ] **Step 6:** materialize `case 'habit'` → `materializeRow_LWW(db, op, userId, 'habits', HABIT_FIELDS)`; `case 'habit_log'` → `materializeRow_LWW(db, op, userId, 'habit_logs', HABIT_LOG_FIELDS)`; add `'habits'`,`'habit_logs'` to the tableName union.
- [ ] **Step 7:** sync-client `case 'habit'` + `case 'habit_log'` (get→applyOp→put) + add `db.habits`,`db.habit_logs` to the transaction table list.
- [ ] **Step 8:** ops union — add `'habit'`,`'habit_log'`.
- [ ] **Step 9: Tests** — round-trip both kinds: a `habit` create + a `habit_log` create materialize to server D1 + client Dexie; a `habit_log` DELETE op tombstones it (deleted_at set) both sides; a habit update (name) per-field LWW. Update any literal that must typecheck.
- [ ] **Step 10: Gate** `pnpm lint && pnpm typecheck && pnpm test habit materialize sync && pnpm build` → pass. **Step 11: Commit** named files.

---

### Task 2: pure `habitStreaks`

**Files:** Create `src/lib/habits.ts`, `src/lib/habits.test.ts`

**Interfaces (Produces):**
- `type HabitStreaks = { current: number; longest: number; completedToday: boolean; rate30: number }`
- `habitStreaks(days: string[], today: string): HabitStreaks` — `days` = the habit's completion YYYY-MM-DD strings (dedup via Set); `today` = YYYY-MM-DD in the user's tz.
  - `completedToday` = `set.has(today)`.
  - `current`: let anchor = completedToday ? today : yesterday(today); if `!set.has(anchor)` → 0; else count back consecutive days present starting at anchor (anchor, anchor-1, …) until a gap. (So a run ending today or yesterday is "current"; missing both → 0.)
  - `longest`: the longest run of consecutive present days anywhere in the set.
  - `rate30`: count of present days within the last 30 days (today-29 … today inclusive) / 30 (a 0–1 fraction).
  - Pure. Use a pure `addDays(dayStr, n)` on the date string (parse `YYYY-MM-DD` as UTC, add, reformat) — do NOT use the real clock. No mutation.

- [ ] **Step 1: Failing tests** `habits.test.ts` (fixed `today='2026-08-22'`):
  - completed today + prior 4 consecutive → `current: 5, completedToday: true`.
  - completed yesterday + before, NOT today → `current` = the run ending yesterday, `completedToday: false` (streak still alive).
  - neither today nor yesterday → `current: 0`.
  - a gap splits runs → `longest` = the longer run; `current` reflects only the run at today/yesterday.
  - `rate30`: 15 of the last 30 days → `0.5`; days older than 30 don't count.
  - empty days → all zeros/false.
  - duplicate day strings deduped (no double count).
- [ ] **Step 2: Run fail → implement `habits.ts`** → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test habits` → pass. **Step 4: Commit** named files.

---

### Task 3: `/habits` page + hooks + nav link

**Files:**
- Create: `src/hooks/use-habits.ts`, `src/hooks/use-habit-logs.ts`, `src/app/habits/page.tsx`
- Modify: `src/app/app/page.tsx` (a Habits link in the header, next to dashboard/settings)

**Interfaces (Produces):**
- `useHabits(userId): HabitRow[]` — non-deleted, non-archived, sorted by name (mirror use-accounts).
- `useHabitLogs(userId): HabitLogRow[]` — non-deleted (mirror; used to derive completions + streaks).

- [ ] **Step 1: hooks** (mirror use-accounts / use-archived-accounts; also an archived-habits variant for restore).
- [ ] **Step 2: page** `src/app/habits/page.tsx` (mirror the accounts page auth shell + the today-tasks tz "today"):
  - Compute `todayStr` in the user's tz (`toLocaleDateString('en-CA', { timeZone: prefs.tz })`, from a memoized nowMs — no Date.now in render).
  - For each active habit: derive its completion days from `useHabitLogs` (`logs.filter(l => l.habit_id === habit.id && !l.deleted_at).map(l => l.day)`), compute `habitStreaks(days, todayStr)`. Render a row: `{icon} {name}`, a big **check-off toggle** (done state = `completedToday`), and "🔥 {current}" current streak + a muted "best {longest} · {Math.round(rate30*100)}% (30d)".
  - **Toggle handler:** `id = ` `hlog-${habit.id}-${todayStr}`; if currently completed → a `habit_log` DELETE op on that id; else a `habit_log` CREATE op (payload {habit_id, day: todayStr}) with `entity_id = id`. Then applyLocalOp + pushPullOnce. (Deterministic id makes it idempotent.)
  - A create form (name + optional icon) → `habit` create op. Archive/restore a habit → `{is_archived}` update op. Empty state "Add your first habit."
  - 44px targets, aria-labels, no Date.now in render.
- [ ] **Step 3: nav link** in `src/app/app/page.tsx` header (~line 721, beside the dashboard/settings Links) add a `<Link href="/habits">` with an icon + aria-label, same styling.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /habits). **Step 5: Commit** named files.

---

### Task 4: dashboard `habits` widget

**Files:**
- Create: `src/components/dashboard/habits-widget.tsx`
- Modify: `src/lib/widgets.ts` (catalog + type), `src/components/dashboard/widget-card.tsx` (dispatcher)

- [ ] **Step 1: widgets.ts** — add `'habits'` to `WidgetType` + a `WIDGET_CATALOG` entry `{ type:'habits', label:'Habits', description:'Today\'s habits + streaks' }`. NOT in `DEFAULT_WIDGET_TYPES`.
- [ ] **Step 2: `habits-widget.tsx`** — `<HabitsWidget userId />`: `useHabits` + `useHabitLogs` + `useUserPrefs`; `todayStr` (tz, memoized nowMs). For each habit: `habitStreaks` → a compact row with the check-off toggle (same create/delete-op toggle as the page) + "🔥 {current}". Empty (no habits) → muted "Add habits in Habits" with a `<Link href="/habits">`. No Date.now in render.
- [ ] **Step 3: dispatcher** — `widget-card.tsx`: `if (type === 'habits') return <section …><HabitsWidget userId={userId} /></section>`.
- [ ] **Step 4: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green. **Step 5: Commit** named files.

## Self-review

- **Coverage:** two entities both-sides + migration (T1) · pure streak math (T2) · /habits page with toggle + CRUD + nav (T3) · dashboard widget (T4). Scheduling/reminders/voice/5th-tab deferred. ✓
- **Placeholders:** none — schemas/fields/migration exact; streak signature + tests explicit; toggle op mechanics + tz-today named.
- **Type consistency:** `HabitPayload`/`HabitLogPayload`/`HabitRow`/`HabitLogRow`/`HABIT_FIELDS`/`HABIT_LOG_FIELDS` (T1) → `habitStreaks`/`HabitStreaks` (T2) → hooks/page (T3) → widget (T4).
- **Guards:** deterministic log id → idempotent toggle; deleted logs excluded from streaks; empty states (no habits, zero streak); tz-correct "today" (not UTC).

## Post-merge (owner)

Apply migration 0021 to remote D1 (habits + habit_logs — CREATE TABLE + INDEX each as SEPARATE `--command`s; retry transient) + verify with `pragma_table_info`. Then open `/habits` → add a habit (e.g. "Meditate"), check it off daily, watch the streak build; add the Habits widget on `/dashboard`.
