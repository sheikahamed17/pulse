# Desktop Polish Pass — Design

**Date:** 2026-07-23
**Status:** Approved (design)
**Feature:** Conservative laptop/desktop refinements after the fixed-tab-bar overlap fix — fill the empty Notes sidebar, use more of a wide screen, and add desktop breathing room.

## Context & constraint

Sheik reported the app looked bad on laptop; the top-bar overlap (`position:fixed` desktop TabBar) was fixed + shipped (`e1cc1b2`). He then flagged three remaining desktop gripes: empty right column on the Notes tab, too much empty space on wide screens, and phone-tuned (small/cramped) sizes. **Hard constraint: the app cannot be rendered/screenshot in-session**, so this pass uses *safe, structural levers* (outer container width/spacing + a self-contained summary card) that cannot reflow component internals, plus one targeted type bump flagged for the owner's visual verification. Presentational-only — no logic/schema/sync change.

## Changes

### 1. `NotesSummary` card (fills the empty Notes sidebar)

The desktop `<aside>` (`page.tsx`) renders a summary card for money/tasks/learning but nothing for notes → the 320px column is blank on the Notes tab. Add `src/components/notes-summary.tsx`, mirroring `LearningSummary` exactly over `useNotes(userId)`:
- "This week" (notes with `occurred_at >= now-7d`), "Total" (count), "Top tags" (up to 5 by frequency).
- Same glass card markup as `LearningSummary`.

Wire into the aside: `{activeTab === 'notes' && <NotesSummary userId={user.id} />}` alongside the existing three.

### 2. Wider desktop container + sidebar (low-risk)

In `<main>`: `max-w-5xl` → `max-w-6xl` (1024→1152px) and `md:grid-cols-[1fr_320px]` → `md:grid-cols-[1fr_360px]`. Uses more of a wide screen; the reading column stays a comfortable width. Outer-grid only — no component internals affected.

### 3. Roomier desktop spacing (low-risk, `md:` only)

- `<main>`: `gap-6 p-6` → keep, add `md:gap-8 md:p-8` (desktop breathing room; mobile `p-6`/`gap-6` untouched).
- Left column `<div className="flex flex-col gap-6">` → add `md:gap-7`.

These add outer whitespace at `md+` only.

### 4. Targeted type bump (owner-verified)

The four lists' primary row text `text-sm` → `text-sm md:text-base`:
- money-list: the description/category line (`div.text-sm.font-medium.text-foreground`).
- task-list: the title `<span>` inside the complete-toggle.
- learning-list: the `<p className="text-sm">{e.text}</p>`.
- notes-list: the `<p className="text-sm font-medium">{title||preview}</p>`.

This is the "text too small" lever and the one change that can't be verified in-session — flagged for on-device check; trivially revertible if it reads too large.

## Non-goals

- No global font-scale change, no per-tab grid restructuring, no login/settings redesign (can't verify blind; out of scope for this conservative pass).
- No new unit tests — presentational only (matches how the sibling summaries and the overlap fix shipped: gate = typecheck/lint/build + existing suite; on-device QA).

## Error handling / risk

Outer container + spacing + a self-contained card cannot break individual component layouts. The only cascading-risk change is the list type bump (§4), bounded to four known elements and reversible. `NotesSummary` handles empty state (0 notes → "0 / 0", no top-tags block) exactly like `LearningSummary`.

## Testing

No new unit tests (presentational). Gate: `pnpm typecheck` / `lint` / `test` (existing suite stays green) / `build`. On-device QA runbook (`docs/superpowers/notes/2026-07-23-pulse-desktop-polish-qa-runbook.md`): verify on a laptop that the Notes tab now has a right-column card; wide screens use more width; desktop feels roomier; the list text reads well (not too big).

## Plan shape

~2 tasks: (1) `NotesSummary` + wire into the aside; (2) container width + `md:` spacing + list type bump + QA runbook + gate. No opus review (presentational); owner verifies visually post-deploy.

## Constraints (verbatim)

- Presentational only; no logic/schema/sync/dependency change. Dexie v9.
- Safe structural levers preferred; the one type change (§4) is bounded + owner-verified.
- Mobile layout untouched (all spacing/type bumps are `md:`).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Gate UN-CHAINED.
