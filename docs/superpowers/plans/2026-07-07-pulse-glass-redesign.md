# Pulse Glassmorphism Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pulse a distinctive dark **glassmorphism** identity — frosted panels over an indigo→cyan aurora, money as a glowing mono HUD — applied across every screen, on mobile + Windows desktop, with zero behavior changes.

**Architecture:** A shared design-system foundation (CSS tokens + `.glass` material utilities + self-hosted Geist fonts + an aurora background component) is built first; every component task then consumes those utilities and swaps decorative emoji chrome for `lucide-react` icons. Presentational only — component props, hooks, routes, and logic are untouched.

**Tech Stack:** Next 16, React 19, Tailwind 4, shadcn, `next/font` (via `geist`), `lucide-react`.

Spec: `docs/superpowers/specs/2026-07-07-pulse-glass-redesign-design.md`. Approved mockup: the glass `/app` mockup (phone + desktop).

## Global Constraints

- **Presentational only.** Do NOT change any hook, `/api/*` route, sync/agent/cron logic, Dexie/D1 schema, or component props/signatures. If a reskin seems to need a logic change, stop and flag it.
- Dark is the **single** theme for v1 (no toggle). Dark palette lives at `:root`.
- **New deps allowed (only these):** `lucide-react`, `geist`. No others.
- Every money amount, date, and count renders in **Geist Mono** with `tabular-nums`. Accent = `linear-gradient(150deg, var(--primary), var(--accent-2))` (indigo→cyan). Semantic colors (spend `--destructive`, income `--income`, warning `--warning`) are separate from the accent.
- Keep **emoji for user category icons**; use lucide only for app chrome.
- All motion gated behind `@media (prefers-reduced-motion: reduce)`. Visible keyboard focus rings. Text over glass must meet WCAG AA.
- Git identity: `sdsheikahamed@gmail.com` / `Sheik Ahamed`.
- **Per-task verification (the "test cycle" for this presentational work):** `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `pnpm test` (stays 454 green — fix any test asserting a removed emoji/label), and **`pnpm build`** (next build passes — this is mandatory; it is the check that catches prerender/build breakage). Then commit.

---

## File Structure

- `package.json` — add `lucide-react`, `geist`.
- `src/app/layout.tsx` — wire Geist sans + mono font variables.
- `src/app/globals.css` — dark token palette, new semantic tokens, `@utility glass/glass-soft/glass-accent`, aurora keyframes, radius bump.
- `src/components/aurora-background.tsx` — **new**; the fixed ambient aurora layer (client component, reduced-motion aware).
- `src/components/ui/{button,card,input,label}.tsx` — restyle variants onto the glass system.
- `src/components/tab-bar.tsx` — segmented glass control / floating bottom dock + lucide icons.
- `src/components/money-card.tsx`, `money-list.tsx` — HUD figure + sparkline; glass rows.
- `src/components/digest-card.tsx`, `confirmation-chip.tsx` — accent glass / glass chip.
- `src/components/voice-recorder.tsx`, `receipt-button.tsx` — glass buttons + lucide.
- `src/components/task-list.tsx`, `task-filter.tsx`, `task-summary.tsx`, `query-answer-card.tsx`, `category-picker.tsx`, `period-picker.tsx` — glass surfaces + mono figures.
- `src/app/app/page.tsx` — mount aurora + reskin header/input/shells (NOT the effects).
- `src/app/settings/page.tsx`, `src/app/settings/preferences/page.tsx`, `src/app/settings/categories/page.tsx`, `src/app/settings/recurring/page.tsx` — glass panels/inputs, preserving prefs a11y.

---

### Task 1: Design-system foundation (deps, fonts, tokens, glass material, aurora)

**Files:**
- Modify: `package.json` (deps)
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/aurora-background.tsx`

**Interfaces:**
- Produces: CSS custom properties (`--background`, `--foreground`, `--muted-foreground`, `--primary`, `--accent-2`, `--destructive`, `--income`, `--warning`, `--border`, `--radius`), Tailwind utilities `glass` / `glass-soft` / `glass-accent`, the `--font-sans` / `--font-mono` families (Geist), and `<AuroraBackground />`.

- [ ] **Step 1: Add dependencies**

```bash
pnpm add lucide-react geist
```
Expected: both added to `package.json` dependencies; `pnpm install` clean.

- [ ] **Step 2: Wire Geist fonts in `src/app/layout.tsx`**

Replace the file with (keeps existing metadata/viewport):

```tsx
import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse',
  description: 'Personal AI life-OS — voice-first PWA',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Pulse', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0a0b16',
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
```
(`GeistSans.variable` defines `--font-geist-sans`; `GeistMono.variable` defines `--font-geist-mono`. Note themeColor updated to the new ground.)

- [ ] **Step 3: Rework `src/app/globals.css` — palette, tokens, glass utilities, aurora**

Replace the `:root` / `.dark` blocks with a single dark palette at `:root`, add semantic tokens, bump radius, and map the fonts. Keep the `@import` lines and the `@theme inline` block, adding the new color mappings (`--color-accent-2`, `--color-income`, `--color-warning`) and `--font-sans: var(--font-geist-sans)` / `--font-mono: var(--font-geist-mono)`.

```css
:root{
  --background: oklch(0.13 0.03 275);      /* #0a0b16, indigo-biased near-black */
  --foreground: oklch(0.93 0.02 275);
  --card: oklch(0.20 0.03 275 / 40%);
  --card-foreground: oklch(0.93 0.02 275);
  --popover: oklch(0.17 0.03 275 / 92%);
  --popover-foreground: oklch(0.93 0.02 275);
  --primary: oklch(0.64 0.19 274);         /* indigo #6f7bff */
  --primary-foreground: oklch(0.14 0.03 265);
  --accent-2: oklch(0.82 0.14 210);        /* cyan #34e6ff */
  --secondary: oklch(1 0 0 / 8%);
  --secondary-foreground: oklch(0.93 0.02 275);
  --muted: oklch(1 0 0 / 6%);
  --muted-foreground: oklch(0.68 0.03 275);  /* #8a90ab */
  --accent: oklch(1 0 0 / 8%);
  --accent-foreground: oklch(0.93 0.02 275);
  --destructive: oklch(0.68 0.19 12);      /* spend/delete #ff5c7a */
  --income: oklch(0.80 0.16 165);          /* #34e0a1 */
  --warning: oklch(0.82 0.16 75);          /* #ffb020 */
  --border: oklch(1 0 0 / 11%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.82 0.14 210);
  --radius: 1rem;
}
```
Add to the `@theme inline` block:
```css
  --color-accent-2: var(--accent-2);
  --color-income: var(--income);
  --color-warning: var(--warning);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
```
Append the glass utilities + aurora keyframes:
```css
@utility glass {
  background: linear-gradient(160deg, rgb(255 255 255 / .085), rgb(255 255 255 / .055));
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid rgb(255 255 255 / .11);
  box-shadow: 0 10px 34px rgb(0 0 0 / .45), inset 0 1px 0 rgb(255 255 255 / .09);
}
@utility glass-soft {
  background: rgb(255 255 255 / .05);
  border: 1px solid rgb(255 255 255 / .07);
}
@utility glass-accent {
  background: linear-gradient(150deg, rgb(111 123 255 / .16), rgb(52 230 255 / .07));
  border: 1px solid rgb(120 160 255 / .28);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}
@keyframes aurora-drift { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(3vw,3vw) scale(1.1)} }
```

- [ ] **Step 4: Create `src/components/aurora-background.tsx`**

```tsx
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[8vw] -top-[10vw] h-[52vw] w-[52vw] rounded-full opacity-50 blur-[60px] motion-safe:animate-[aurora-drift_26s_ease-in-out_infinite]"
           style={{ background: 'radial-gradient(circle, #3a2bff, transparent 62%)', mixBlendMode: 'screen' }} />
      <div className="absolute -right-[6vw] top-[6vw] h-[46vw] w-[46vw] rounded-full opacity-50 blur-[60px] motion-safe:animate-[aurora-drift_30s_ease-in-out_infinite]"
           style={{ background: 'radial-gradient(circle, #00d6ff, transparent 62%)', mixBlendMode: 'screen' }} />
      <div className="absolute bottom-[-14vw] left-[28vw] h-[40vw] w-[40vw] rounded-full opacity-40 blur-[60px] motion-safe:animate-[aurora-drift_34s_ease-in-out_infinite]"
           style={{ background: 'radial-gradient(circle, #7b3bff, transparent 60%)', mixBlendMode: 'screen' }} />
    </div>
  )
}
```
(`motion-safe:` ensures reduced-motion users get a static aurora.)

- [ ] **Step 5: Verify + commit**

```powershell
pnpm typecheck; pnpm lint; pnpm test; pnpm build
```
Expected: all exit 0; suite 454 pass; build succeeds. Manually: the app ground is deep indigo-black with a soft aurora; text uses Geist. Then:
```powershell
git -c user.email=sdsheikahamed@gmail.com -c user.name='Sheik Ahamed' commit -am "feat(ui): glass design-system foundation — tokens, glass utilities, Geist fonts, aurora"
```

---

### Task 2: `/app` shell — mount aurora, reskin header + shared input row

**Files:** Modify `src/app/app/page.tsx` (presentational regions ONLY — the render/JSX for the header, the shared voice/text input container, and the tab-content wrappers). **Do NOT touch** the `useEffect` drain effects, `withWebLock`, handlers, or any hook/logic.

**Interfaces:** Consumes `<AuroraBackground />` (Task 1) and `glass` utilities.

- [ ] **Step 1:** Import and mount `<AuroraBackground />` once at the top of the `AppPageInner` return (inside the outermost wrapper). Import `{ AuroraBackground } from '@/components/aurora-background'`.
- [ ] **Step 2:** Reskin the header row: brand wordmark with a small gradient "pulse" dot (`h-2 w-2 rounded-full bg-[linear-gradient(var(--primary),var(--accent-2))]` with a cyan glow), settings link as a lucide `Settings` icon button (`text-muted-foreground hover:text-foreground` in a `rounded-xl` hover target).
- [ ] **Step 3:** Reskin the shared input row (the `<div className="flex justify-center gap-2 py-2">` holding VoiceRecorder + ReceiptButton + text input) into a single `glass rounded-2xl` bar: text field transparent, placeholder `text-muted-foreground`, mic + camera as trailing buttons (styled in Tasks 6). Keep all existing `onParsed`/`disabled`/state wiring exactly.
- [ ] **Step 4:** Wrap the money/tasks tab-content sections in consistent spacing (`flex flex-col gap-3`) without changing conditional logic.
- [ ] **Step 5:** Verify (`typecheck/lint/test/build` green; app shell matches the mockup's glass header + input) + commit `feat(ui): glass app shell — aurora, header, input bar`.

---

### Task 3: TabBar — segmented glass + floating bottom dock + lucide icons

**Files:** Modify `src/components/tab-bar.tsx`. Keep the `Props` (`active`, `onChange`, `taskBadgeCount`) and behavior.

- [ ] **Step 1:** Replace emoji (💸/✅) with lucide icons (`Wallet` for money, `CheckSquare` for tasks). Import from `lucide-react`.
- [ ] **Step 2:** Desktop/top variant: a `glass` segmented control; active tab = accent-gradient pill (`bg-[linear-gradient(150deg,rgb(111_123_255/.35),rgb(52_230_255/.22))] border border-[rgb(120_190_255/.4)]` + glow), inactive = `text-muted-foreground`.
- [ ] **Step 3:** Mobile bottom variant: a floating `glass rounded-2xl` dock (inset from edges, `bottom-4 left-4 right-4`), active item icon gets the cyan glow (`text-accent-2 drop-shadow-[0_0_8px_rgb(52_230_255/.6)]`). Badge → mono pill in `bg-warning text-[#211500]`.
- [ ] **Step 4:** Verify + commit `feat(ui): glass tab bar + bottom dock, lucide icons`.

---

### Task 4: MoneyCard (HUD figure + sparkline) + MoneyList rows

**Files:** Modify `src/components/money-card.tsx`, `src/components/money-list.tsx`. Preserve all hooks (`useMoneyEntries`, `useCategories`, `useFxRates`, `useUndoStack`), long-press, FX-convert, and delete/undo logic.

- [ ] **Step 1 (MoneyCard):** `glass` panel. Uppercase muted label ("Spent · this month"). The total in `font-mono text-[38px] font-semibold tabular-nums` with a cyan text-shadow glow and the currency symbol in `text-accent-2`. Add a small inline SVG sparkline (area fill = cyan gradient, stroke cyan, emphasized endpoint dot) — derive points from the existing entries data already in scope; if no series is readily available, render a static representative sparkline (presentational) and leave a `// TODO(data): wire real series` — **actually do not leave a TODO; instead** compute a simple last-N daily-total series from the `entries` already loaded by the card's hook and map to an SVG polyline. Keep it read-only.
- [ ] **Step 2 (MoneyList):** rows use `glass-soft rounded-2xl` (avoid per-row heavy blur for perf). Structure: emoji category chip in a `rounded-xl` tile, title + muted meta, signed amount in `font-mono tabular-nums` (`text-destructive` for `out`, `text-income` for `in`). Receipt entries get a `receipt` tag pill (`text-[10px] border rounded-full px-1.5 text-muted-foreground`). Keep the 📎 direct-navigation button, long-press menu, and FX-convert exactly.
- [ ] **Step 3:** Verify + commit `feat(ui): money HUD card + glass entry rows`.

---

### Task 5: DigestCard + ConfirmationChip

**Files:** Modify `src/components/digest-card.tsx`, `src/components/confirmation-chip.tsx`. Preserve dismissal (sync_meta), the `receiptPreviewUrl` `<Image unoptimized>` thumbnail, and confirm/cancel wiring.

- [ ] **Step 1 (DigestCard):** `glass-accent` panel, lucide `Sparkles`/`Star` in cyan, heading + narrative; metrics in `font-mono`. Keep the dismiss control.
- [ ] **Step 2 (ConfirmationChip):** `glass rounded-2xl` chip; amount + editable fields in mono; primary confirm button = accent gradient; keep the receipt `<Image ... unoptimized fill>` thumbnail block and every field/edit handler.
- [ ] **Step 3:** Verify + commit `feat(ui): glass digest card + confirmation chip`.

---

### Task 6: VoiceRecorder + ReceiptButton

**Files:** Modify `src/components/voice-recorder.tsx`, `src/components/receipt-button.tsx`. Preserve all recording/streaming/queue/enqueue state and `onParsed` contracts.

- [ ] **Step 1 (VoiceRecorder):** mic = accent-gradient glass round button (`bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] text-[#06111f]` with a cyan shadow); recording state uses a `motion-safe:animate-pulse` ring (static under reduced-motion); error/queued text in `text-destructive`/`text-muted-foreground`. Replace the emoji glyph with a lucide `Mic`.
- [ ] **Step 2 (ReceiptButton):** glass icon button with lucide `Camera`; state labels (Uploading…/Parsing…/Failed) keep their logic; error text `text-destructive`.
- [ ] **Step 3:** Verify + commit `feat(ui): glass voice + receipt buttons`.

---

### Task 7: Tasks surfaces + QueryAnswerCard + pickers

**Files:** Modify `src/components/task-list.tsx`, `task-filter.tsx`, `task-summary.tsx`, `query-answer-card.tsx`, `category-picker.tsx`, `period-picker.tsx`. Preserve all hooks/handlers.

- [ ] **Step 1:** Task rows → `glass-soft` with a lucide status affordance (`Circle`/`CheckCircle2`); due/overdue meta uses `--warning`; counts in mono. TaskFilter = segmented glass control (match TabBar treatment). TaskSummary = `glass` panel, mono counts.
- [ ] **Step 2:** QueryAnswerCard → `glass` panel, amounts in mono, accent for emphasis; keep dismiss.
- [ ] **Step 3:** CategoryPicker / PeriodPicker → glass popover/segmented surfaces; keep selection logic + emoji category icons.
- [ ] **Step 4:** Verify + commit `feat(ui): glass tasks surfaces, query card, pickers`.

---

### Task 8: shadcn primitives — button / card / input / label

**Files:** Modify `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`. Keep every exported component name, variant name, and prop.

- [ ] **Step 1 (button):** restyle variants — `default` = accent gradient (`text-[#06111f]`, cyan shadow), `secondary`/`outline` = `glass` surfaces, `ghost` = transparent→`glass` on hover; visible `focus-visible:ring-2 ring-ring`. Do not rename variants.
- [ ] **Step 2 (card):** `glass rounded-2xl` base.
- [ ] **Step 3 (input):** transparent/`glass-soft` field, `border-input`, `focus-visible:ring-2 ring-accent-2`, mono for numeric inputs where a `data-numeric`/`inputMode="decimal"` is present (keep it simple: apply `font-mono tabular-nums` to inputs with `inputMode="decimal"`).
- [ ] **Step 4 (label):** uppercase micro-label option via existing usage; ensure muted color + tracking utilities available.
- [ ] **Step 5:** Verify + commit `feat(ui): glass shadcn primitives`.

---

### Task 9: Settings pages

**Files:** Modify `src/app/settings/page.tsx`, `src/app/settings/preferences/page.tsx`, `src/app/settings/categories/page.tsx`, `src/app/settings/recurring/page.tsx`. Mount `<AuroraBackground />` on each settings shell. **Preserve the prefs a11y exactly** (tz list `role="listbox"`/`role="option"`/`aria-selected`, the `role="alert"` save-error, the `useUserPrefs` save flow) and all category/recurring CRUD logic.

- [ ] **Step 1:** Reskin section panels to `glass`, inputs/selects to the Task-8 styles, headings to the type scale; keep every control's handler + aria intact.
- [ ] **Step 2:** Verify (incl. the prefs a11y still present) + commit `feat(ui): glass settings pages`.

---

### Task 10: Polish, accessibility & full-gate pass

**Files:** Any touched above, as needed.

- [ ] **Step 1:** Contrast audit — verify AA for `--foreground`/`--muted-foreground` over glass + aurora; darken aurora opacity or lift panel fill if any text dips below AA.
- [ ] **Step 2:** Focus + reduced-motion audit — every interactive element has a visible `focus-visible` ring; confirm all animations (aurora, hovers, pulses) are `motion-safe:` gated.
- [ ] **Step 3:** Perf — scroll a long money/task list on a phone profile; if `backdrop-filter` jank appears, confirm rows use `glass-soft` (flat) not full `glass`.
- [ ] **Step 4:** Full gate — `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- [ ] **Step 5:** Visual QA against the mockup at mobile (≤400px) and desktop (≥1024px) widths.
- [ ] **Step 6:** Commit `chore(ui): glass redesign polish + a11y pass`.

---

## Self-Review

**Spec coverage:** tokens/material/dark-default (T1) ✓; type + mono figures (T1 + applied per component) ✓; lucide icons + kept emoji (T3–T8) ✓; aurora + motion + reduced-motion (T1, T10) ✓; every component in the spec's list has a task (T2–T9) ✓; responsive mobile/desktop (T2/T3 + all) ✓; a11y/contrast/focus (T9, T10) ✓; `next build` in every gate ✓; new-deps limited to lucide + geist (T1) ✓; no-logic-change constraint stated on every component task ✓.

**Placeholder scan:** one "TODO(data)" was written then immediately corrected in T4/Step 1 to compute a real series from loaded entries — no placeholder ships. No other TBD/TODO.

**Type consistency:** token names (`--accent-2`, `--income`, `--warning`), utility names (`glass`/`glass-soft`/`glass-accent`), and `<AuroraBackground />` are used identically wherever referenced.

**Note for the executor:** because the repo has no DOM/render test env, tasks add no unit tests; the per-task gate is `typecheck + lint + test(stays green) + build` plus a visual match to the approved mockup. Flag (don't silently make) any change that would require touching component logic/props.
