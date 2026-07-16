# Pulse Logo — Design Spec

**Date:** 2026-07-08
**Status:** Approved direction (Concept A "Signal" + full matching treatment; `@resvg/resvg-js` dev-dep approved). Ready for implementation plan.
**Scope:** Add a real brand mark for Pulse and wire it everywhere an icon/logo belongs. Presentational only — no logic, sync, auth, or data changes.

## Problem

The app has no logo. The PWA icons (`public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`) are empty 68-byte stubs, so the installed iOS home-screen icon is blank. The only brand mark today is a small gradient dot in the `/app` header. The manifest also has a colour bug: `theme_color`/`background_color` are `#0a0a0a` (pure black) instead of the brand `#0a0b16`.

## The mark — "Signal"

A glowing **pulse/ping**: a gradient core dot with two concentric emanating rings. Grows directly from the existing header dot.

- **Gradient:** `linear-gradient(150deg, #6f7bff, #34e6ff)` (brand indigo→cyan), expressed in SVG as a `linearGradient` from top-left to bottom-right.
- **Geometry** (100×100 viewBox, centre 50,50): outer ring `r=36 stroke-width=2 opacity=.26`; inner ring `r=24 stroke-width=3 opacity=.55`; core dot `r=11.5 fill=gradient`. (Ring stroke-widths scale up slightly at small sizes for legibility — see the concept board.)
- **Ground:** transparent for the bare mark; the app-icon variant sits on a dark rounded tile (`#0a0b16` base + a soft radial cyan glow) with a maskable safe zone (mark ≤ ~66% of the canvas so Android/iOS mask cropping never clips it).

## Deliverables

1. **`public/logo.svg`** — the bare mark (transparent bg), single source of truth for in-app + email use.
2. **`scripts/logo-icon.svg`** (or inline in the gen script) — the app-icon master: dark rounded tile + radial glow + centred mark, maskable-safe.
3. **Generated PNGs** (replace the stubs), produced by the gen script and committed as static assets:
   - `public/icons/icon-192.png` (192×192)
   - `public/icons/icon-512.png` (512×512)
   - `public/icons/maskable-512.png` (512×512, mark scaled into the safe zone, full-bleed dark background)
   - `src/app/apple-icon.png` (180×180) — Next serves this as the apple-touch-icon automatically.
4. **`src/app/icon.svg`** — SVG favicon (Next auto-serves it + emits the `<link>`); the mark on a small dark rounded tile for tab-bar legibility.
5. **Manifest fix** — `theme_color` and `background_color`: `#0a0a0a` → `#0a0b16`.
6. **`src/components/pulse-logo.tsx`** — a shared `<PulseLogo/>` inline-SVG React component (accepts `className`/size) used in-app.

## Icon generation

- Add **`@resvg/resvg-js`** as a **devDependency** (dev-only; never bundled into the Worker — the deploy just serves the committed PNGs).
- Add **`scripts/gen-icons.mjs`**: reads the app-icon master SVG, rasterizes it to the four PNG sizes with resvg, writes them to `public/icons/` and `src/app/apple-icon.png`. Add a `package.json` script `"gen:icons": "node scripts/gen-icons.mjs"`. Run once; commit the outputs.
- The master SVG must use only resvg-supported features (linear/radial gradients, shapes, SVG `<filter>` blur for the glow). No CSS `filter:` (that's HTML-only) — bake any glow as an SVG element (a blurred radial-gradient rect) so it rasterizes.

## In-app placement

- **Header** (`src/app/app/page.tsx:278`): replace the plain `<div class="h-2 w-2 rounded-full …">` dot with `<PulseLogo className="size-6" />`. The `<h1>Pulse</h1>` wordmark stays.
- **Login** (`src/app/login/page.tsx`): add `<PulseLogo/>` above the `Sign in to Pulse` title, centred.
- **Magic-link email** (`src/lib/email.ts` `buildMagicLinkEmail`): add a logo `<img>` at the top of the HTML. Use an **absolute** URL derived from the magic-link: `new URL(url).origin + '/icons/icon-192.png'` (email clients can't resolve relative paths, and inline SVG is unreliable in email — a hosted PNG is the safe choice). `width=48 height=48`. The plain-text version is unchanged.

## Constraints

- Presentational only — no logic/sync/auth/route/data changes; component props unchanged elsewhere.
- Only new dependency: `@better-auth`-unrelated **`@resvg/resvg-js`** (devDependency). Nothing shipped to the Worker.
- Follow the glass system tokens (`#0a0b16`, `#6f7bff`, `#34e6ff`, 150° gradient). Git identity `sdsheikahamed@gmail.com`.
- Gate every task: `pnpm typecheck` + `pnpm lint` + `pnpm test` (stays 463 green) + **`pnpm build`** (next build).

## Testing & verification

- Presentational; no new unit tests required. Keep the 463-test suite green; `pnpm build` must pass (the generated `src/app/icon.svg` / `apple-icon.png` must be valid so Next's metadata build doesn't fail).
- Manual: confirm the generated PNGs are non-trivial (not 68 bytes), the mark renders (gradient + rings visible) in each PNG, the header + login show the mark, and after deploy the iOS home-screen icon is no longer blank.

## Risks & mitigations

- **resvg can't render some SVG feature** (e.g. a CSS filter) → keep the master SVG to gradients + shapes + SVG `<filter>` blur only; verify the emitted PNGs visually.
- **Maskable cropping clips the mark** → keep the mark within the inner ~66% safe zone on a full-bleed dark background.
- **Email image blocked/not loaded** → the email still works without it (text + button remain); the `<img>` has `alt="Pulse"`.
- **`favicon.ico` stub remains** → `src/app/icon.svg` takes precedence for modern browsers; the legacy `.ico` is harmless and out of scope (can be regenerated later if desired).
