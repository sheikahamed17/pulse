# Pulse Glassmorphism Redesign — Design Spec

**Date:** 2026-07-07
**Status:** Approved direction (mockup signed off). Ready for implementation plan.
**Scope:** Presentational overhaul only — a cohesive "glass HUD" visual identity applied across the existing app. **No behavior, data, sync, agent, or cron logic changes.** Component public APIs/props stay the same; only markup/classes/styles change.

## Goal

Replace the current generic light-grayscale shadcn look with a distinctive, modern/futuristic **glassmorphism** identity: frosted translucent panels floating over a calm indigo→cyan aurora, money rendered as a glowing monospace HUD, restrained motion. Must feel great and stay legible on both **Windows desktop** and **mobile PWA**, for an app opened many times a day.

## Non-goals

- No changes to `/api/*` routes, the sync engine, Groq agents, crons, Dexie/D1 schema, or op-log.
- No new screens or features; no re-layout of information architecture (tabs, sidebar, bottom dock stay).
- No copy rewrites beyond incidental label/aria improvements.
- Not introducing a component library beyond the icon set below.

## Global constraints

- Stack stays: Next 16 + React 19 + **Tailwind 4** + shadcn + Serwist PWA. Keep `cn()` + Tailwind utility patterns.
- **New dependencies (flagged, all free/build-time):** `lucide-react` (icons) and `geist` (self-hosted Geist + Geist Mono via `next/font`). No other deps.
- Dark is the **default and only** theme for v1 (no theme toggle). The existing `.dark` block is repurposed as the single palette applied at `:root`.
- All 454 tests stay green; `pnpm build` (next build) must pass. Presentational changes must not break tests that assert visible text/aria; watch for any test asserting emoji or class strings.
- Git identity `sdsheikahamed@gmail.com`. Accessibility: WCAG AA contrast for text over glass, visible focus rings, `prefers-reduced-motion` honored, ≥44px touch targets on mobile.

## Design tokens (rework `src/app/globals.css`)

Single dark palette at `:root` (OKLCH; hex shown for reference). Neutrals are indigo-biased, never pure black/gray.

| Token | Value (hex ref) | Use |
|---|---|---|
| `--background` | `#0a0b16` | app ground (under the aurora) |
| `--foreground` | `#e9ecf7` | primary text |
| `--muted-foreground` | `#8a90ab` | secondary text |
| `--card` | glass (see material) | panels |
| `--border` | `rgba(255,255,255,.11)` | hairline strokes |
| `--primary` | indigo `#6f7bff` | primary actions/accent |
| `--accent-2` | cyan `#34e6ff` | gradient end, glow, charts |
| `--destructive` / spend | `#ff5c7a` | spend, delete |
| `--income` | `#34e0a1` | income (new token) |
| `--warning` | `#ffb020` | overdue/badges (new token) |
| `--radius` | `1rem` (16px base) | bumped up from 0.625rem for softer glass |

**Accent gradient:** `linear-gradient(150deg, var(--primary), var(--accent-2))` — used on active tabs, the mic button, focus glow, sparkline/category bars. Semantic colors (spend/income/warning) are **separate** from the accent and never substitute for it.

**Aurora background:** a fixed, `z-0`, blurred, low-opacity layer of 2–3 radial-gradient blobs (indigo/violet/cyan) with a slow `drift` keyframe (disabled under reduced-motion). Lives once in the `/app` and settings shells behind the content.

## The glass material (shared utility)

Add a reusable material rather than repeating classes. Provide as a Tailwind `@utility glass` (Tailwind 4) or a small `.glass` class in `globals.css`:

```
background: linear-gradient(160deg, rgba(255,255,255,.085), rgba(255,255,255,.055));
backdrop-filter: blur(22px) saturate(150%);
border: 1px solid rgba(255,255,255,.11);
box-shadow: 0 10px 34px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.09);
border-radius: var(--radius);
```

A lighter `glass-soft` variant (less blur, for dense rows) and a `glass-accent` variant (indigo→cyan tinted, for the digest card + active states). **Perf guard:** cap the number of independently-blurred layers on a screen; list rows use `glass-soft` (or a single blurred container behind flat rows) to avoid dozens of `backdrop-filter` contexts on long lists.

## Typography

- Load **Geist** (UI/body) + **Geist Mono** (numerals/data) via `geist/font` (self-hosted, no CSP/webfont-CDN issue in the app; the Artifact mockup's system-font stack was only a mockup constraint). Wire into `layout.tsx` `<body>` and the `--font-sans` / `--font-mono` tokens.
- **All money amounts, dates, counts** use Geist Mono with `font-variant-numeric: tabular-nums`.
- Type scale + weights: brand/headings 600–700 with slight negative tracking; labels uppercase with `.16em` tracking; body 400–500. Headings get `text-wrap: balance`.

## Iconography

- Adopt **`lucide-react`** for app chrome (settings gear, tabs, mic, camera, chevrons, digest star, etc.), replacing decorative emoji in chrome (🎙️ 📷 ⚙️ 💸 ✅).
- **Keep emoji for user-owned category icons** (🍴 🛒 🚕 💰 …) — they carry meaning + warmth and are user-data.

## Motion

Restrained, purposeful, all `prefers-reduced-motion`-gated:
- Aurora slow drift (ambient).
- Hover: panel/row lift (`translateY(-1px)`) + border brighten.
- Tab switch: active pill glide + glow.
- Panel mount: subtle fade/scale-in (chips, cards).
- No looping/attention animations beyond the aurora.

## Component-by-component treatment

Each keeps its props/behavior; only presentation changes.

- **`layout.tsx`** — wire Geist fonts; keep dark ground.
- **`app/app/page.tsx` shell** — add the aurora background layer; convert the header, the shared voice/text input row, and content wrappers to glass; keep the existing responsive structure (mobile bottom dock, desktop top bar + right sidebar). (Do not touch the drain effects / logic added earlier.)
- **`tab-bar.tsx`** — segmented glass control; active = accent-gradient pill with glow; badge → mono pill in `--warning`; lucide icons; mobile bottom dock is a floating glass bar.
- **`money-card.tsx`** — the month total as the glowing mono HUD figure + a small sparkline + "under/over usual" delta; glass panel.
- **`money-list.tsx`** — glass(-soft) rows: emoji chip, title + meta, mono signed amount (spend `--destructive`, income `--income`); the `receipt` tag pill; keep long-press menu, FX-convert, undo.
- **`digest-card.tsx`** — `glass-accent` panel with a lucide star, mono metrics; keep dismissal.
- **`confirmation-chip.tsx`** — glass chip; keep the `unoptimized` `<Image>` receipt thumbnail; amount in mono; accent confirm button.
- **`voice-recorder.tsx`** — mic as accent-gradient glass button with state styling (recording pulse under reduced-motion = static); keep queue/enqueue logic.
- **`receipt-button.tsx`** — glass icon button (lucide camera); keep streaming states + enqueue-on-failure.
- **`query-answer-card.tsx`, `task-list.tsx`, `task-filter.tsx`, `task-summary.tsx`, `category-picker.tsx`, `period-picker.tsx`** — onto glass panels/controls; mono for counts/amounts.
- **shadcn `ui/button|card|input|label`** — restyle variants to the glass system (glass surfaces, accent primary, visible focus ring); keep the component APIs.
- **Settings pages (`/settings`, `/settings/preferences|categories|recurring`)** — same glass panels, inputs, and the existing prefs a11y (tz listbox `role`s, save-error alert) preserved.

## Responsive

- **Mobile:** single column; floating glass bottom dock; full-width glass panels; generous touch targets.
- **Desktop/Windows:** top glass bar + tabs; two-column body (list + summary/category sidebar); hover states active. Both already exist structurally — glass applies to each breakpoint.

## Testing & verification

- Presentational, so no new unit tests required. Keep the suite green; fix any test that asserts a removed emoji/label/class.
- **Must run `pnpm build` (next build) in the gate** (per the recorded lesson) + `pnpm typecheck` + `pnpm lint` + `pnpm test`.
- Manual visual pass on a Windows browser at mobile + desktop widths; verify AA contrast of text over glass/aurora, focus visibility, and reduced-motion.

## Risks & mitigations

- **Glass legibility over the aurora** → keep panel fills ≥ the tested opacity, add the inner highlight, verify AA; darken the aurora opacity if text contrast dips.
- **`backdrop-filter` perf on long lists/low-end phones** → use `glass-soft`/single-blur-container for rows; test scroll on a phone.
- **Font/icon deps** → `geist` + `lucide-react` are standard, free, tree-shaken; flagged above.
- **Tailwind 4 `@utility`/`@theme` correctness** → validate tokens compile and dark applies at `:root`.
