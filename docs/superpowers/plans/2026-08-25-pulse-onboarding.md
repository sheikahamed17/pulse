# Getting Started checklist — design & plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Help a new instance (clone-and-run model — every self-hoster starts empty) discover the setup that unlocks Pulse's features: a "Getting Started" checklist on `/dashboard` that shows what's set up vs not, with a link to complete each step. Auto-hides when done; dismissible.

**Architecture:** PURE read-layer over existing hooks — no migration, no entity, no new data. A pure `onboardingSteps(counts)` computes step completion from counts + push status; a `<GettingStarted>` card renders the incomplete checklist at the top of `/dashboard` (nothing when all core steps are done or the user dismissed it).

## v1 scope + non-goals

- v1 = a checklist card on `/dashboard` with core steps: log an entry, set up accounts, set a budget, add a recurring bill, enable notifications, track a habit. Each step: done-state (from the user's data) + a link to complete it + a one-line "why". Auto-hides when all core steps done; dismissible (localStorage).
- **Deferred:** a full multi-screen wizard; per-step inline completion (each step just LINKS to the relevant page); tracking "tried the assistant" (no completion signal); confetti/gamification.

## Global Constraints

- **Gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm build`** all green. No `Date.now()` in render/useMemo; no synchronous setState in an effect body; no reading `ref.current` during render.
- Client-only pure read layer; NO migration/entity/sync change. Reuse `useAccounts`/`useHabits`/`useRecurringRules`/`useBudgets`/`useMoneyEntries` + `usePushSubscription` (status) + `useUserPrefs`.
- `git add` only named files; git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`; don't push.
- Merging to `main` auto-deploys; verify CI+Deploy green + prod `/dashboard` + `/app` 200. **Whole-branch review** (light — pure read layer + one card): confirm completion logic, auto-hide, dismiss persistence, and that existing `/dashboard` widgets are untouched.

## Background (verified)

- Hooks return arrays: `useAccounts(userId)`, `useHabits(userId)`, `useRecurringRules(userId)`, `useBudgets(userId)`, `useMoneyEntries(userId)`. `usePushSubscription()` returns `{ status: 'unsupported'|'denied'|'unsubscribed'|'subscribed'|'pending', … }`.
- `/dashboard` (`src/app/dashboard/page.tsx`): renders `WidgetCard`s from `useWidgets`. Add the checklist ABOVE the widget grid.
- The push-enable UI + the recurring-rule create live in Settings — grep for the exact routes (`/settings/preferences` or a notifications toggle; `/settings/recurring`). Use the real hrefs.

---

### Task 1: pure `onboardingSteps`

**Files:** Create `src/lib/onboarding.ts`, `src/lib/onboarding.test.ts`

**Interfaces (Produces):**
- `type OnboardingCounts = { entries: number; accounts: number; budgets: number; recurring: number; habits: number; pushSubscribed: boolean }`
- `type OnboardingStep = { id: string; label: string; why: string; href: string; done: boolean }`
- `onboardingSteps(c: OnboardingCounts): OnboardingStep[]` — returns these steps in order, each `done` computed from `c`:
  1. `{ id:'entry', label:'Log your first entry', why:'Capture money, tasks, learning or notes', href:'/app', done: c.entries > 0 }`
  2. `{ id:'accounts', label:'Set up your accounts', why:'Unlocks net worth, forecast, goals & transfers', href:'/settings/accounts', done: c.accounts > 0 }`
  3. `{ id:'budget', label:'Set a budget', why:'Get overspend alerts', href:'/app?tab=money', done: c.budgets > 0 }`
  4. `{ id:'recurring', label:'Add a recurring bill', why:'Powers your cash-flow forecast + reminders', href:'/settings/recurring', done: c.recurring > 0 }`
  5. `{ id:'push', label:'Enable notifications', why:'Budget & bill reminders', href:'<the push-enable route>', done: c.pushSubscribed }`
  6. `{ id:'habit', label:'Track a habit', why:'Build daily streaks', href:'/habits', done: c.habits > 0 }`
- `allStepsDone(steps: OnboardingStep[]): boolean` — every step done.
- Pure; no side effects.

- [ ] **Step 1: Failing tests** `onboarding.test.ts`:
  - all-zero counts → 6 steps, all `done:false`, `allStepsDone` false.
  - full counts (all >0, pushSubscribed true) → all `done:true`, `allStepsDone` true.
  - partial (e.g. entries>0, accounts=0) → the `entry` step done, `accounts` not; correct per-step.
  - step order + ids stable; hrefs correct.
- [ ] **Step 2: Run fail → implement `onboarding.ts`** → pass.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test onboarding` → pass. **Step 4: Commit** named files.

---

### Task 2: `<GettingStarted>` card + render on `/dashboard`

**Files:**
- Create: `src/components/dashboard/getting-started.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: component** `<GettingStarted userId />`:
  - Counts from hooks: `useMoneyEntries` (entries — non-deleted length; or accept any-domain entry, but money length is fine as the "logged something" signal), `useAccounts`, `useBudgets`, `useRecurringRules`, `useHabits`, `usePushSubscription().status === 'subscribed'`.
  - `const steps = onboardingSteps({ entries, accounts, budgets, recurring, habits, pushSubscribed })` (memoized).
  - Dismiss: a localStorage flag `pulse.onboardingDismissed` (per-user key ok) — read once (in an effect or a lazy initializer that guards `typeof window`), a `dismissed` state; a "Dismiss" button sets it.
  - Render NOTHING when `allStepsDone(steps)` OR `dismissed`. Else a glass card "Get started" listing steps: done → a checked/struck muted row; not-done → a `<Link href={step.href}>` with the label + a muted `why`. A small progress hint ("{doneCount}/{steps.length}"). A "Dismiss" affordance. 44px targets, aria-labels. No Date.now/ref-in-render/sync-setState-in-effect (set dismissed in the click handler + read localStorage in an effect or lazy initializer).
- [ ] **Step 2: render on /dashboard** — in `src/app/dashboard/page.tsx`, render `<GettingStarted userId={userId} />` ABOVE the widget grid (only when `userId`). Don't disturb the widgets/reorder logic.
- [ ] **Step 3: Gate** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green (build prerenders /dashboard). **Step 4: Commit** named files.

## Self-review

- **Coverage:** pure step computation (T1) · the card + auto-hide + dismiss + /dashboard placement (T2). Wizard/inline-completion/assistant-tracking deferred. ✓
- **Placeholders:** none — step list + completion rules + hrefs explicit; component wiring names the hooks.
- **Type consistency:** `OnboardingCounts`/`OnboardingStep`/`onboardingSteps`/`allStepsDone` (T1) consumed by the card (T2).
- **Guards:** auto-hides when all done; dismissible + persisted; pure read layer (no writes); existing dashboard widgets untouched; lint-safe state/effect patterns.

## Post-merge

Verify prod `/dashboard` + `/app` 200. This helps any new instance (and nudges the remaining setup: accounts, push, a recurring bill, a habit). Auto-disappears once everything's set up.
