# Pulse Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pulse a real "Signal" brand mark (glowing indigo→cyan pulse dot + rings) and wire it into the PWA icon set, favicon, header, login, and magic-link email.

**Architecture:** One SVG geometry is the source of truth. A dev-only `@resvg/resvg-js` script rasterizes an app-icon master SVG into the committed PWA PNGs + apple-touch-icon; a shared `<PulseLogo/>` React component covers in-app use; the email uses a hosted PNG. Presentational only.

**Tech Stack:** SVG, `@resvg/resvg-js` (devDependency), Next 16 app-router metadata-file conventions (`icon.svg`, `apple-icon.png`), React 19, Tailwind 4.

## Global Constraints

- **Presentational only** — no logic/sync/auth/route/data changes; no component API changes beyond the new `<PulseLogo/>`.
- **Only new dependency:** `@resvg/resvg-js` as a **devDependency** (never bundled into the Worker; deploy serves committed PNGs).
- Brand tokens: ground `#0a0b16`, indigo `#6f7bff`, cyan `#34e6ff`, gradient `linear-gradient(150deg,#6f7bff,#34e6ff)`.
- Master SVGs use only resvg-supported features (linear/radial gradients + shapes). No CSS `filter:` in the rasterized master (bake glow as a radial-gradient rect).
- Gate every task: `pnpm typecheck` (0) + `pnpm lint` (0) + `pnpm test` (stays 463 green; Task 3 adds 0 net — updates an existing test) + **`pnpm build`** (next build must compile).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Branch `feature/logo` (already created; spec committed at `2f7136c`).

---

### Task 1: PWA icon set + favicon + apple-icon + manifest fix

**Files:**
- Create: `scripts/logo-icon.svg` (app-icon master), `scripts/gen-icons.mjs`, `src/app/icon.svg` (favicon)
- Modify: `package.json` (+`@resvg/resvg-js` devDep, +`gen:icons` script) + `pnpm-lock.yaml`
- Overwrite: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png` (currently 68-byte stubs); create `src/app/apple-icon.png`
- Modify: `public/manifest.webmanifest`

- [ ] **Step 1: Add the rasterizer devDependency**

Run: `pnpm add -D @resvg/resvg-js`
Expected: added to `devDependencies`, lockfile updated. (Native module — installs a prebuilt binary for the platform.)

- [ ] **Step 2: Create the app-icon master** — `scripts/logo-icon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14162a"/>
      <stop offset="1" stop-color="#0b0c19"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="44%" r="55%">
      <stop offset="0" stop-color="#34e6ff" stop-opacity="0.30"/>
      <stop offset="0.6" stop-color="#34e6ff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#34e6ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6f7bff"/>
      <stop offset="1" stop-color="#34e6ff"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#glow)"/>
  <g transform="translate(256,256)">
    <circle r="150" fill="none" stroke="url(#mark)" stroke-width="10" opacity="0.26"/>
    <circle r="100" fill="none" stroke="url(#mark)" stroke-width="14" opacity="0.55"/>
    <circle r="50" fill="url(#mark)"/>
  </g>
</svg>
```
(Mark within the ~410px maskable safe zone; full-bleed dark background so mask cropping never shows a seam.)

- [ ] **Step 3: Create the generator** — `scripts/gen-icons.mjs`

```js
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const svg = readFileSync(join(here, 'logo-icon.svg'), 'utf8')

const targets = [
  { out: 'public/icons/icon-192.png', size: 192 },
  { out: 'public/icons/icon-512.png', size: 512 },
  { out: 'public/icons/maskable-512.png', size: 512 },
  { out: 'src/app/apple-icon.png', size: 180 },
]

for (const { out, size } of targets) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(join(root, out), png)
  console.log(`wrote ${out} — ${size}px, ${png.length} bytes`)
}
```

- [ ] **Step 4: Add the npm script** — in `package.json` `"scripts"`, add:

```json
    "gen:icons": "node scripts/gen-icons.mjs",
```

- [ ] **Step 5: Generate the PNGs**

Run: `pnpm gen:icons`
Expected: four lines printed, each with a byte count in the **thousands** (NOT 68). Confirm the three `public/icons/*.png` are overwritten and `src/app/apple-icon.png` is created.

Verify sizes (must be > 1000 bytes each):
Run: `node -e "for (const f of ['public/icons/icon-192.png','public/icons/icon-512.png','public/icons/maskable-512.png','src/app/apple-icon.png']) console.log(f, require('fs').statSync(f).size)"`
Expected: all sizes in the thousands.

- [ ] **Step 6: Create the SVG favicon** — `src/app/icon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6f7bff"/>
      <stop offset="1" stop-color="#34e6ff"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="#0a0b16"/>
  <circle cx="16" cy="16" r="10.5" fill="none" stroke="url(#g)" stroke-width="1.6" opacity="0.5"/>
  <circle cx="16" cy="16" r="5" fill="url(#g)"/>
</svg>
```
(One ring + core only — two rings muddy at 16px.)

- [ ] **Step 7: Fix the manifest colours** — `public/manifest.webmanifest`

Change `"background_color": "#0a0a0a"` → `"#0a0b16"` and `"theme_color": "#0a0a0a"` → `"#0a0b16"`. Leave everything else (name, icons array, start_url) unchanged.

- [ ] **Step 8: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; test count stays 463; `next build` compiles (it must pick up `src/app/icon.svg` + `src/app/apple-icon.png` as valid metadata files without error).

- [ ] **Step 9: Commit**

```bash
git add scripts/logo-icon.svg scripts/gen-icons.mjs src/app/icon.svg src/app/apple-icon.png public/icons/icon-192.png public/icons/icon-512.png public/icons/maskable-512.png public/manifest.webmanifest package.json pnpm-lock.yaml
git commit -m "feat(brand): generate Pulse app icon set + favicon + fix manifest colors"
```

---

### Task 2: `<PulseLogo/>` component + header + login placement

**Files:**
- Create: `public/logo.svg`, `src/components/pulse-logo.tsx`
- Modify: `src/app/app/page.tsx` (header dot → logo), `src/app/login/page.tsx` (logo above title)

**Interfaces:**
- Produces: `export function PulseLogo({ className, title }: { className?: string; title?: string }): JSX.Element`

- [ ] **Step 1: Create the bare mark** — `public/logo.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Pulse">
  <defs>
    <linearGradient id="pulseGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6f7bff"/>
      <stop offset="1" stop-color="#34e6ff"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="36" fill="none" stroke="url(#pulseGrad)" stroke-width="3" opacity="0.26"/>
  <circle cx="50" cy="50" r="24" fill="none" stroke="url(#pulseGrad)" stroke-width="4" opacity="0.55"/>
  <circle cx="50" cy="50" r="12" fill="url(#pulseGrad)"/>
</svg>
```

- [ ] **Step 2: Create the component** — `src/components/pulse-logo.tsx`

```tsx
// Shared brand mark. Rendered at most once per page (header on /app, logo on
// /login), so the fixed gradient id does not collide.
export function PulseLogo({ className, title = 'Pulse' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      style={{ filter: 'drop-shadow(0 0 6px rgba(52,230,255,0.5))' }}
    >
      <defs>
        <linearGradient id="pulseLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6f7bff" />
          <stop offset="1" stopColor="#34e6ff" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="36" fill="none" stroke="url(#pulseLogoGrad)" strokeWidth="3" opacity="0.26" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="url(#pulseLogoGrad)" strokeWidth="4" opacity="0.55" />
      <circle cx="50" cy="50" r="12" fill="url(#pulseLogoGrad)" />
    </svg>
  )
}
```

- [ ] **Step 3: Swap the header dot** — `src/app/app/page.tsx`

Add the import alongside the other component imports:
```tsx
import { PulseLogo } from '@/components/pulse-logo'
```
Replace this block (around line 276-279):
```tsx
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Pulse</h1>
              <div className="h-2 w-2 rounded-full bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] shadow-lg shadow-cyan-500/20" />
            </div>
```
with:
```tsx
            <div className="flex items-center gap-2">
              <PulseLogo className="size-6" />
              <h1 className="text-2xl font-semibold">Pulse</h1>
            </div>
```
Change NOTHING else in the file (all effects/handlers/`AppPageInner`/`LockGate` wrap stay byte-identical).

- [ ] **Step 4: Add the logo to login** — `src/app/login/page.tsx`

Add the import:
```tsx
import { PulseLogo } from '@/components/pulse-logo'
```
Replace the `CardHeader`:
```tsx
          <CardHeader>
            <CardTitle>Sign in to Pulse</CardTitle>
          </CardHeader>
```
with:
```tsx
          <CardHeader className="items-center gap-2">
            <PulseLogo className="size-12" />
            <CardTitle>Sign in to Pulse</CardTitle>
          </CardHeader>
```
Change nothing else (both sign-in handlers, state, fallback flow stay identical).

- [ ] **Step 5: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; 463 tests; build compiles.

- [ ] **Step 6: Commit**

```bash
git add public/logo.svg src/components/pulse-logo.tsx src/app/app/page.tsx src/app/login/page.tsx
git commit -m "feat(brand): PulseLogo component in app header + login"
```

---

### Task 3: Logo in the magic-link email

**Files:**
- Modify: `src/lib/email.ts` (`buildMagicLinkEmail`)
- Modify: `tests/lib/email.test.ts` (assert the hosted logo `<img>`)

- [ ] **Step 1: Update the failing test first** — `tests/lib/email.test.ts`

In the existing `buildMagicLinkEmail` test, after the current assertions, add:
```ts
    // Logo is a hosted PNG whose origin is derived from the magic-link URL.
    expect(html).toContain('https://pulse.sdsheikahamed.workers.dev/icons/icon-192.png')
    expect(html).toContain('alt="Pulse"')
```
(The test's `url` is `https://pulse.sdsheikahamed.workers.dev/api/auth/magic-link/verify?token=abc`, so the derived origin is `https://pulse.sdsheikahamed.workers.dev`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- email`
Expected: FAIL — html does not yet contain the icon URL.

- [ ] **Step 3: Add the logo `<img>`** — `src/lib/email.ts`

In `buildMagicLinkEmail`, derive the origin and prepend the image. Change the function body so `html` becomes:
```ts
  const origin = new URL(url).origin
  const html = `<!doctype html><html><body style="margin:0;background:#0a0b16;color:#e9ecf7;font-family:system-ui,-apple-system,sans-serif;padding:32px">
  <img src="${origin}/icons/icon-192.png" alt="Pulse" width="48" height="48" style="display:block;margin:0 0 16px;border-radius:12px"/>
  <h1 style="font-size:20px;margin:0 0 16px">Sign in to Pulse</h1>
  <p style="color:#8a90ab;margin:0 0 24px">Tap the button to sign in. This link expires shortly.</p>
  <a href="${url}" style="display:inline-block;background:linear-gradient(150deg,#6f7bff,#34e6ff);color:#0a0b16;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:12px">Sign in to Pulse</a>
  <p style="color:#8a90ab;font-size:12px;margin:24px 0 0">If you didn't request this, you can ignore this email.</p>
  </body></html>`
```
(Insert `const origin = new URL(url).origin` above the `const html = ...` line. The `text` version and `sendMagicLinkEmail` are unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- email`
Expected: PASS (all email tests green, including the new assertions).

- [ ] **Step 5: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; 463 tests; build compiles.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts tests/lib/email.test.ts
git commit -m "feat(brand): add Pulse logo to magic-link email"
```

---

## Self-Review

**Spec coverage:** master SVG + bare mark → Task 2 (`public/logo.svg`); app-icon master + PNGs + favicon + apple-icon + manifest fix → Task 1; `@resvg/resvg-js` devDep + gen script → Task 1; `<PulseLogo/>` + header + login → Task 2; email `<img>` (origin-derived) → Task 3; presentational-only + gate incl. build → Global Constraints + every task. ✓

**Placeholder scan:** No TBD/TODO; every step has literal code or an exact command with expected output.

**Type consistency:** `PulseLogo({ className, title })` signature identical between its definition (Task 2 Step 2) and both call sites (Task 2 Steps 3-4). Gradient ids differ per file (`pulseGrad` in logo.svg, `pulseLogoGrad` in the component, `g`/`bg`/`glow`/`mark` in the icon masters) to avoid any cross-file `url(#id)` collision. `buildMagicLinkEmail(url: string)` signature unchanged (Task 3 derives `origin` internally) — its only caller, `sendMagicLinkEmail`, is untouched.
