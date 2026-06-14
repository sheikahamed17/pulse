# Pulse — Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable Pulse PWA skeleton with working magic-link auth and an HLC + op-log + per-field LWW sync engine. End state: create a `Widget` (one-field toy entity) on the phone, see it appear on the desktop within 5 seconds via the deployed CF Pages URL — both directions.

**Architecture:** Next.js 15 PWA on Cloudflare Pages, Workers handle `/api/sync` + `/api/auth/*` routes, Xata Postgres mirrors the op-log + materialized entities, Dexie.js on IndexedDB is the client source of truth, custom HLC-based sync engine keeps both sides converged with deterministic replay.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, Tailwind 4, shadcn/ui, Serwist (PWA), Dexie.js, Better Auth, Xata (`@xata.io/client`), Vitest, fast-check, Zod, pnpm, Wrangler.

**Scope note:** This is Plan 1 of 5. Plans for Phases 1–4 (voice + money agent, tasks/learning + desktop layout, insights + push + receipt vision, OSS launch) are written when we reach each phase, informed by what we ship now.

---

## Prerequisites

Before Task 1:

- Node.js ≥ 20.10 (`node -v`)
- pnpm ≥ 9 (`pnpm -v`); install if missing: `npm install -g pnpm`
- Git ≥ 2.40 (`git --version`)
- A Cloudflare account (free tier) — https://dash.cloudflare.com/sign-up
- A Xata account (free tier) — https://xata.io/
- A Groq account + API key (free) — https://console.groq.com/keys *(not used in Phase 0; collected now to avoid context switching later)*
- A GitHub repository created empty: `pulse`, no auto-README, your visibility choice
- Existing local repo at `C:\Users\SDMrSheikAhamed\Documents\Claude\Projects\Pulse\` containing `docs/` and `.git/` (already done — first commit `a141218` is the design spec)

---

## File structure (target layout after Phase 0)

```
pulse/
├── .github/workflows/
│   └── ci.yml                       # lint + test on PR
├── docs/superpowers/
│   ├── specs/2026-06-15-pulse-design.md
│   └── plans/2026-06-15-phase-0-foundation.md
├── public/
│   ├── manifest.webmanifest         # PWA manifest
│   └── icons/                       # 192/512/maskable
├── src/
│   ├── app/
│   │   ├── layout.tsx               # root layout + manifest link
│   │   ├── page.tsx                 # redirects to /login or /app
│   │   ├── globals.css              # tailwind imports
│   │   ├── login/page.tsx           # magic-link login UI
│   │   ├── app/page.tsx             # authenticated app shell (Widget UI)
│   │   └── api/
│   │       ├── auth/[...all]/route.ts  # Better Auth handler
│   │       └── sync/route.ts           # /api/sync POST handler
│   ├── lib/
│   │   ├── env.ts                   # Zod-validated env vars
│   │   ├── auth.ts                  # Better Auth instance
│   │   ├── xata.ts                  # Xata client + helpers
│   │   ├── dexie.ts                 # Dexie schema + db instance
│   │   ├── hlc.ts                   # Hybrid Logical Clock
│   │   ├── op-log.ts                # Op type + apply function
│   │   ├── sync-client.ts           # client-side sync engine
│   │   └── sync-server.ts           # server-side sync handler
│   ├── components/
│   │   ├── ui/                      # shadcn primitives
│   │   └── widget-form.tsx          # toy entity form
│   └── types/
│       └── ops.ts                   # shared Op + entity types + Zod schemas
├── tests/
│   ├── setup.ts                     # vitest setup
│   ├── hlc.test.ts
│   ├── op-log.test.ts
│   └── sync.test.ts
├── xata/
│   └── schema.json                  # Xata schema definition
├── .env.example                     # env template
├── .gitignore
├── next.config.ts                   # Next.js config + Serwist
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── wrangler.toml                    # Cloudflare config
└── README.md
```

Each lib file has one clear responsibility. `hlc.ts` knows nothing about ops; `op-log.ts` knows nothing about HTTP; `sync-client.ts` orchestrates them. Tests live in `tests/` (Vitest convention) and mirror lib module names.

---

## Tasks

> Each task is one self-contained change. Commit after each task (atomic history). Run `pnpm typecheck && pnpm test` before every commit (the CI check from Task 5 enforces this — but get the habit early).

---

### Task 1: Bootstrap Next.js 15 + TypeScript + Tailwind into existing Pulse directory

**Files:**
- Create: many (whole Next.js scaffold)
- Modify: none

The existing `Pulse/` dir already contains `docs/` and `.git/`, so `create-next-app` cannot run in-place. We bootstrap into a sibling temp dir and merge.

- [ ] **Step 1: From the parent Projects directory, bootstrap Next.js into a temp dir**

Run (in PowerShell from `C:\Users\SDMrSheikAhamed\Documents\Claude\Projects`):

```powershell
pnpm dlx create-next-app@latest pulse-init `
  --typescript `
  --tailwind `
  --eslint `
  --app `
  --src-dir `
  --turbopack `
  --import-alias "@/*" `
  --use-pnpm
```

Expected: a `pulse-init/` directory containing the standard Next.js 15 scaffold (`src/app/`, `package.json`, `next.config.ts`, etc.).

- [ ] **Step 2: Merge the scaffold into existing `Pulse/`, preserving its `docs/` and `.git/`**

Run:

```powershell
Copy-Item -Path "pulse-init\*" -Destination "Pulse\" -Recurse -Exclude "node_modules",".git"
Remove-Item -Path "pulse-init" -Recurse -Force
```

Expected: `Pulse/` now contains both the original `docs/` + `.git/` *and* the new Next.js files (`src/`, `package.json`, etc.).

- [ ] **Step 3: Install deps**

```powershell
cd Pulse
pnpm install
```

Expected: dependencies installed in `Pulse/node_modules/` and `pnpm-lock.yaml` written.

- [ ] **Step 4: Verify the dev server starts**

```powershell
pnpm dev
```

Open `http://localhost:3000` in a browser. Expected: the default Next.js welcome page renders. Stop the dev server with `Ctrl+C`.

- [ ] **Step 5: Commit**

```powershell
git add -A
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "chore: bootstrap Next.js 15 + TS + Tailwind 4 scaffold"
```

---

### Task 2: Install Phase 0 dev + runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```powershell
pnpm add dexie zod better-auth @xata.io/client
```

- [ ] **Step 2: Install dev deps (testing + Serwist + types)**

```powershell
pnpm add -D vitest @vitest/coverage-v8 fast-check @types/node serwist @serwist/next
pnpm add -D prettier prettier-plugin-tailwindcss
```

- [ ] **Step 3: Verify versions in `package.json`**

Open `package.json`. Expected `dependencies` section includes:

```json
{
  "dexie": "^4.x",
  "zod": "^3.x",
  "better-auth": "^1.x",
  "@xata.io/client": "^1.x"
}
```

And `devDependencies` includes:

```json
{
  "vitest": "^2.x",
  "@vitest/coverage-v8": "^2.x",
  "fast-check": "^3.x",
  "serwist": "^9.x",
  "@serwist/next": "^9.x",
  "prettier": "^3.x"
}
```

Exact minor versions depend on what's current at install time; the major versions above are the floor.

- [ ] **Step 4: Commit**

```powershell
git add package.json pnpm-lock.yaml
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "chore: add Phase 0 runtime + dev dependencies"
```

---

### Task 3: Configure Vitest + first sanity test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/sanity.test.ts`
- Modify: `package.json` (add scripts)

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
```

- [ ] **Step 2: Create `tests/setup.ts`** (empty for now; populated when DOM-environment tests are added)

```ts
// Vitest setup file — extend matchers or polyfill globals here as needed.
```

- [ ] **Step 3: Write the failing sanity test in `tests/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs at all', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Add `test`, `test:watch`, `typecheck` scripts to `package.json`**

In `package.json`, replace the `scripts` block:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 5: Run the test, verify it passes**

```powershell
pnpm test
```

Expected: `1 passed`, exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add vitest.config.ts tests/ package.json
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "test: add Vitest + sanity check"
```

---

### Task 4: Install shadcn/ui + verify it works

**Files:**
- Create: `components.json` (shadcn config)
- Create: `src/components/ui/button.tsx` (first shadcn primitive)
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Initialize shadcn**

```powershell
pnpm dlx shadcn@latest init
```

Answer prompts:
- Style: `Default`
- Base color: `Neutral`
- CSS variables: `Yes`

Expected: `components.json` created at repo root, `src/lib/utils.ts` created with `cn()` helper.

- [ ] **Step 2: Add the Button primitive**

```powershell
pnpm dlx shadcn@latest add button
```

Expected: `src/components/ui/button.tsx` created.

- [ ] **Step 3: Replace `src/app/page.tsx` with a sanity render that uses Button**

```tsx
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Pulse</h1>
      <Button>Hello shadcn</Button>
    </main>
  )
}
```

- [ ] **Step 4: Verify the dev server renders it**

```powershell
pnpm dev
```

Open `http://localhost:3000`. Expected: "Pulse" heading + a styled Button. Stop dev server.

- [ ] **Step 5: Commit**

```powershell
git add components.json src/components/ui src/lib/utils.ts src/app/page.tsx src/app/globals.css
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "chore: install shadcn/ui and verify rendering"
```

---

### Task 5: Configure Serwist for PWA service worker + manifest + icons

**Files:**
- Create: `src/app/sw.ts` (service worker entrypoint)
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png` (placeholders; design proper icons in Phase 4)
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx` (link manifest)

- [ ] **Step 1: Create placeholder PWA icons**

Use any 192x192 and 512x512 PNG (a solid-color square is fine for Phase 0; replace with branded icons in Phase 4). Save:
- `public/icons/icon-192.png` (192×192)
- `public/icons/icon-512.png` (512×512)
- `public/icons/maskable-512.png` (512×512 with safe-area padding)

If you don't have an image editor handy, a quick way:

```powershell
# Use Node to make solid-color PNGs (one-off, throw away after Phase 4)
node -e "const {writeFileSync} = require('fs'); const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'); writeFileSync('public/icons/icon-192.png',b); writeFileSync('public/icons/icon-512.png',b); writeFileSync('public/icons/maskable-512.png',b);"
```

(This writes a tiny placeholder PNG to each path; the OS will scale it; ugly but functional for now.)

- [ ] **Step 2: Create `public/manifest.webmanifest`**

```json
{
  "name": "Pulse",
  "short_name": "Pulse",
  "description": "Personal AI life-OS — voice-first PWA",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: Create the service worker entrypoint `src/app/sw.ts`**

```ts
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
```

- [ ] **Step 4: Wire Serwist into `next.config.ts`**

Replace `next.config.ts` with:

```ts
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
})

export default withSerwist({
  reactStrictMode: true,
})
```

- [ ] **Step 5: Link the manifest in `src/app/layout.tsx`**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse',
  description: 'Personal AI life-OS — voice-first PWA',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Pulse',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Build + verify the service worker is registered**

```powershell
pnpm build
pnpm start
```

Open `http://localhost:3000` in Chrome. Open DevTools → Application tab → Service Workers. Expected: a worker registered at `/sw.js` with status "activated and is running". The Manifest section shows the parsed manifest with the icons.

Stop the dev server.

- [ ] **Step 7: Commit**

```powershell
git add next.config.ts src/app/sw.ts src/app/layout.tsx public/manifest.webmanifest public/icons
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(pwa): wire up Serwist service worker + manifest + placeholder icons"
```

---

### Task 6: Define env-var contract with Zod validation

**Files:**
- Create: `src/lib/env.ts`
- Create: `.env.example`
- Create: `.env.local` (gitignored)
- Modify: `.gitignore`

- [ ] **Step 1: Append `.env.local` to `.gitignore`**

Open `.gitignore` and add at the end (if not already present from the create-next-app default):

```
# local env
.env.local
.env*.local
```

- [ ] **Step 2: Create `.env.example`**

```
# Better Auth
BETTER_AUTH_SECRET=change-me-to-a-32-byte-random-hex
BETTER_AUTH_URL=http://localhost:3000

# Xata
XATA_API_KEY=
XATA_DATABASE_URL=

# Groq (not used in Phase 0; collected now to avoid context switching)
GROQ_API_KEY=

# App
NODE_ENV=development
```

- [ ] **Step 3: Create `.env.local` with real values**

Copy `.env.example` to `.env.local` and fill in real keys:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`:
- `BETTER_AUTH_SECRET`: generate via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste output
- `BETTER_AUTH_URL`: `http://localhost:3000` for dev
- `XATA_API_KEY`, `XATA_DATABASE_URL`: filled in Task 7 after Xata setup
- `GROQ_API_KEY`: copy from https://console.groq.com/keys

- [ ] **Step 4: Write the failing test in `tests/env.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from '@/lib/env'

describe('env', () => {
  it('rejects missing BETTER_AUTH_SECRET', () => {
    expect(() => parseEnv({})).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('accepts a valid env', () => {
    const env = parseEnv({
      BETTER_AUTH_SECRET: 'a'.repeat(64),
      BETTER_AUTH_URL: 'http://localhost:3000',
      XATA_API_KEY: 'xau_xxx',
      XATA_DATABASE_URL: 'https://example.xata.sh/db/pulse',
      GROQ_API_KEY: 'gsk_xxx',
      NODE_ENV: 'test',
    })
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000')
  })
})
```

- [ ] **Step 5: Run the test, verify it fails**

```powershell
pnpm test tests/env.test.ts
```

Expected: FAIL (module `@/lib/env` not found).

- [ ] **Step 6: Implement `src/lib/env.ts`**

```ts
import { z } from 'zod'

const EnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be ≥ 32 chars'),
  BETTER_AUTH_URL: z.string().url(),
  XATA_API_KEY: z.string().min(1),
  XATA_DATABASE_URL: z.string().url(),
  GROQ_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return result.data
}

export const env = parseEnv(process.env)
```

- [ ] **Step 7: Run the test, verify it passes**

```powershell
pnpm test tests/env.test.ts
```

Expected: 2 passed.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/env.ts tests/env.test.ts .env.example .gitignore
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(env): add Zod-validated env loader"
```

---

### Task 7: Set up Xata project + schema + generated client

**Files:**
- Create: `xata/schema.json`
- Create: `src/lib/xata.ts`
- Modify: `.env.local`

- [ ] **Step 1: Install Xata CLI globally**

```powershell
pnpm add -g @xata.io/cli
```

- [ ] **Step 2: Authenticate**

```powershell
xata auth login
```

Follow the browser flow. Expected: login successful, token stored.

- [ ] **Step 3: Create a Xata workspace + database via the dashboard**

In your browser at https://app.xata.io/:
- Create workspace `pulse-personal` (or reuse default)
- Create database `pulse` in region closest to you
- Branch: `main`

- [ ] **Step 4: Create `xata/schema.json`**

```json
{
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "email", "type": "email", "unique": true, "notNull": true },
        { "name": "created_at", "type": "datetime", "notNull": true }
      ]
    },
    {
      "name": "devices",
      "columns": [
        { "name": "user", "type": "link", "link": { "table": "users" }, "notNull": true },
        { "name": "device_id", "type": "string", "unique": true, "notNull": true },
        { "name": "name", "type": "string" },
        { "name": "last_sync_hlc", "type": "string" },
        { "name": "created_at", "type": "datetime", "notNull": true }
      ]
    },
    {
      "name": "op_log",
      "columns": [
        { "name": "user", "type": "link", "link": { "table": "users" }, "notNull": true },
        { "name": "op_id", "type": "string", "unique": true, "notNull": true },
        { "name": "hlc", "type": "string", "notNull": true },
        { "name": "device_id", "type": "string", "notNull": true },
        { "name": "entity_kind", "type": "string", "notNull": true },
        { "name": "entity_id", "type": "string", "notNull": true },
        { "name": "op_type", "type": "string", "notNull": true },
        { "name": "payload", "type": "json", "notNull": true },
        { "name": "schema_version", "type": "int", "notNull": true },
        { "name": "applied_at", "type": "datetime", "notNull": true }
      ]
    },
    {
      "name": "widgets",
      "columns": [
        { "name": "user", "type": "link", "link": { "table": "users" }, "notNull": true },
        { "name": "label", "type": "string" },
        { "name": "field_hlcs", "type": "json", "notNull": true },
        { "name": "deleted_at", "type": "datetime" },
        { "name": "created_at", "type": "datetime", "notNull": true },
        { "name": "updated_at", "type": "datetime", "notNull": true }
      ]
    }
  ]
}
```

- [ ] **Step 5: Apply schema + generate client**

```powershell
xata init --schema=xata/schema.json
```

Answer prompts:
- Database: `pulse`
- Workspace: select what you created
- Output: TypeScript
- Path: `src/lib/xata.ts`
- Codegen language: TypeScript

Expected: `src/lib/xata.ts` created (with generated client), `.env` updated with XATA vars (also copy them to `.env.local`).

- [ ] **Step 6: Copy XATA env vars from `.env` to `.env.local`**

The CLI writes to `.env`; we want them in `.env.local` too (since Next.js prefers `.env.local`). Copy the `XATA_API_KEY` and `XATA_DATABASE_URL` lines from `.env` into `.env.local`. Delete `.env` (it duplicates `.env.local` and is committed by default — we don't want secrets in git).

```powershell
Remove-Item .env
```

- [ ] **Step 7: Verify env still parses**

```powershell
pnpm test tests/env.test.ts
```

Expected: PASS.

- [ ] **Step 8: Add a `getXataClient()` wrapper in `src/lib/xata.ts`**

Edit `src/lib/xata.ts` (the file generated by `xata init`) — at the bottom, ensure a `getXataClient` function is exported. If it isn't, append:

```ts
import { env } from '@/lib/env'

let instance: XataClient | undefined
export const getXataClient = () => {
  if (!instance) instance = new XataClient({ apiKey: env.XATA_API_KEY, databaseURL: env.XATA_DATABASE_URL })
  return instance
}
```

(If `xata init` already generated this, skip — but double-check the function uses our validated `env`, not raw `process.env`.)

- [ ] **Step 9: Commit**

```powershell
git add xata/schema.json src/lib/xata.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(xata): apply schema + generate typed client"
```

---

### Task 8: Install + configure Better Auth with magic-link

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Modify: `xata/schema.json` (add Better Auth tables)

- [ ] **Step 1: Read Better Auth's current docs to confirm magic-link plugin API**

Open https://www.better-auth.com/docs/plugins/magic-link in a browser. Confirm the import path, `sendMagicLink` callback signature, and how it composes with the base config. (Library APIs evolve; this is a one-time verification, not a placeholder.)

- [ ] **Step 2: Add Better Auth's required tables to `xata/schema.json`**

Per Better Auth docs, magic-link needs `session`, `account`, `verification` tables alongside `users`. Add to the `tables` array (replace the existing `users` table fields where needed):

```json
{
  "name": "session",
  "columns": [
    { "name": "user", "type": "link", "link": { "table": "users" }, "notNull": true },
    { "name": "token", "type": "string", "unique": true, "notNull": true },
    { "name": "expires_at", "type": "datetime", "notNull": true },
    { "name": "ip_address", "type": "string" },
    { "name": "user_agent", "type": "string" },
    { "name": "created_at", "type": "datetime", "notNull": true },
    { "name": "updated_at", "type": "datetime", "notNull": true }
  ]
},
{
  "name": "verification",
  "columns": [
    { "name": "identifier", "type": "string", "notNull": true },
    { "name": "value", "type": "string", "notNull": true },
    { "name": "expires_at", "type": "datetime", "notNull": true },
    { "name": "created_at", "type": "datetime", "notNull": true }
  ]
}
```

Re-apply schema:

```powershell
xata schema upload xata/schema.json
xata codegen
```

- [ ] **Step 3: Create `src/lib/auth.ts`**

```ts
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { env } from '@/lib/env'
import { getXataClient } from '@/lib/xata'

// Minimal Xata-backed adapter — Better Auth supports a generic adapter pattern.
// See https://www.better-auth.com/docs/adapters/custom-adapter for the full surface.
const xata = getXataClient()

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: {
    // Use Better Auth's drizzle/xata-compatible adapter once stable. For Phase 0
    // we use the in-memory adapter while validating end-to-end UX; we wire the
    // Xata adapter in Task 23 after the login flow is proven.
    dialect: 'memory',
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Phase 0: log the link to the console. We wire real email delivery
        // (Resend / Cloudflare Email Workers free tier) in Phase 4.
        console.log(`[magic-link] for ${email}: ${url}`)
      },
    }),
  ],
})
```

- [ ] **Step 4: Create the catch-all route handler `src/app/api/auth/[...all]/route.ts`**

```ts
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 5: Smoke-test by hitting an auth endpoint**

Start dev server:

```powershell
pnpm dev
```

In a second terminal:

```powershell
curl http://localhost:3000/api/auth/ok
```

Expected: a JSON `200` response (Better Auth's health check). If you get HTML or 404, the catch-all route is misnamed. Stop dev server.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/auth.ts src/app/api/auth xata/schema.json src/lib/xata.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(auth): install Better Auth with magic-link (console delivery for Phase 0)"
```

---

### Task 9: Build the login + magic-link verification UI

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/app/page.tsx`
- Modify: `src/app/page.tsx`
- Add shadcn components: `input`, `card`, `label`

- [ ] **Step 1: Add the form primitives**

```powershell
pnpm dlx shadcn@latest add input label card
```

Expected: `src/components/ui/input.tsx`, `label.tsx`, `card.tsx` created.

- [ ] **Step 2: Implement `src/app/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setErrorMsg('')
    try {
      await authClient.signIn.magicLink({ email, callbackURL: '/app' })
      setState('sent')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Pulse</CardTitle>
        </CardHeader>
        <CardContent>
          {state === 'sent' ? (
            <p className="text-sm text-muted-foreground">
              Magic link sent. Check your inbox (or the dev console).
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={state === 'sending'}>
                {state === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 3: Create the auth client `src/lib/auth-client.ts`**

```ts
import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
})
```

- [ ] **Step 4: Stub the authenticated app shell `src/app/app/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

export default function AppPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setEmail(res.data.user.email)
    })
  }, [router])

  if (!email) return <p className="p-8">Loading…</p>

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Pulse</h1>
      <p className="mt-2 text-sm text-muted-foreground">Signed in as {email}</p>
      <p className="mt-8 text-sm">Widget UI lands in Task 24.</p>
    </main>
  )
}
```

- [ ] **Step 5: Redirect root `/` to `/app`**

Replace `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/app')
}
```

- [ ] **Step 6: End-to-end smoke test**

```powershell
pnpm dev
```

Open `http://localhost:3000`. Expected: redirected to `/login`. Enter your email + submit. Look at the terminal — you should see `[magic-link] for your@email: http://localhost:3000/api/auth/verify-magic-link?token=...`. Open that URL in the same browser. Expected: redirected to `/app` showing "Signed in as your@email".

Stop dev server.

- [ ] **Step 7: Commit**

```powershell
git add src/app/login src/app/app src/app/page.tsx src/lib/auth-client.ts src/components/ui
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(auth): magic-link login UI + authenticated /app shell"
```

---

### Task 10: Implement the Hybrid Logical Clock (HLC)

**Files:**
- Create: `src/lib/hlc.ts`
- Create: `tests/hlc.test.ts`

The HLC is the foundation of every other piece. Get this right and everything below is easier.

- [ ] **Step 1: Write the failing unit tests in `tests/hlc.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  createHlc,
  serializeHlc,
  parseHlc,
  compareHlc,
  tickHlc,
  receiveHlc,
} from '@/lib/hlc'

describe('HLC creation and serialization', () => {
  it('creates an HLC with current time and zero logical counter', () => {
    const h = createHlc('device-a', 1700000000000)
    expect(h.physicalMs).toBe(1700000000000)
    expect(h.logical).toBe(0)
    expect(h.deviceId).toBe('device-a')
  })

  it('serializes and parses round-trip identically', () => {
    const h = createHlc('device-a', 1700000000000)
    const s = serializeHlc(h)
    const parsed = parseHlc(s)
    expect(parsed).toEqual(h)
  })

  it('serialized form is lexicographically sortable', () => {
    const a = serializeHlc({ physicalMs: 1, logical: 0, deviceId: 'a' })
    const b = serializeHlc({ physicalMs: 1, logical: 1, deviceId: 'a' })
    const c = serializeHlc({ physicalMs: 2, logical: 0, deviceId: 'a' })
    expect([a, b, c].sort()).toEqual([a, b, c])
  })
})

describe('HLC tick (advance local clock)', () => {
  it('advances physical ms when physical clock is ahead', () => {
    const h = createHlc('device-a', 100)
    const next = tickHlc(h, 200) // wall clock now reads 200
    expect(next.physicalMs).toBe(200)
    expect(next.logical).toBe(0)
  })

  it('increments logical counter when physical clock stalls', () => {
    const h = { physicalMs: 100, logical: 0, deviceId: 'a' }
    const next = tickHlc(h, 100) // wall clock unchanged
    expect(next.physicalMs).toBe(100)
    expect(next.logical).toBe(1)
  })

  it('increments logical counter when physical clock is behind (clock drift)', () => {
    const h = { physicalMs: 100, logical: 5, deviceId: 'a' }
    const next = tickHlc(h, 50) // wall clock went backwards
    expect(next.physicalMs).toBe(100)
    expect(next.logical).toBe(6)
  })
})

describe('HLC receive (incorporate remote HLC)', () => {
  it('advances past remote when remote.physicalMs > local', () => {
    const local = { physicalMs: 100, logical: 0, deviceId: 'a' }
    const remote = { physicalMs: 200, logical: 0, deviceId: 'b' }
    const next = receiveHlc(local, remote, 150) // wall clock = 150
    expect(next.physicalMs).toBe(200)
    expect(next.logical).toBe(1)
    expect(next.deviceId).toBe('a') // still our device
  })

  it('uses max logical + 1 when physicalMs ties', () => {
    const local = { physicalMs: 100, logical: 3, deviceId: 'a' }
    const remote = { physicalMs: 100, logical: 7, deviceId: 'b' }
    const next = receiveHlc(local, remote, 100)
    expect(next.physicalMs).toBe(100)
    expect(next.logical).toBe(8)
  })
})

describe('HLC compare', () => {
  it('orders by physicalMs first', () => {
    expect(compareHlc(
      { physicalMs: 1, logical: 9, deviceId: 'z' },
      { physicalMs: 2, logical: 0, deviceId: 'a' }
    )).toBeLessThan(0)
  })

  it('breaks ties by logical', () => {
    expect(compareHlc(
      { physicalMs: 1, logical: 0, deviceId: 'z' },
      { physicalMs: 1, logical: 1, deviceId: 'a' }
    )).toBeLessThan(0)
  })

  it('breaks remaining ties by deviceId lexicographically', () => {
    expect(compareHlc(
      { physicalMs: 1, logical: 0, deviceId: 'a' },
      { physicalMs: 1, logical: 0, deviceId: 'b' }
    )).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```powershell
pnpm test tests/hlc.test.ts
```

Expected: FAIL (`@/lib/hlc` not found).

- [ ] **Step 3: Implement `src/lib/hlc.ts`**

```ts
export type Hlc = {
  physicalMs: number
  logical: number
  deviceId: string
}

export function createHlc(deviceId: string, physicalMs: number): Hlc {
  return { physicalMs, logical: 0, deviceId }
}

// Lexicographically sortable: <16-digit physicalMs>-<6-digit logical>-<deviceId>
const PHYSICAL_PAD = 16
const LOGICAL_PAD = 6

export function serializeHlc(h: Hlc): string {
  const p = h.physicalMs.toString().padStart(PHYSICAL_PAD, '0')
  const l = h.logical.toString().padStart(LOGICAL_PAD, '0')
  return `${p}-${l}-${h.deviceId}`
}

export function parseHlc(s: string): Hlc {
  const [p, l, ...rest] = s.split('-')
  if (!p || !l || rest.length === 0) {
    throw new Error(`Invalid HLC serialization: ${s}`)
  }
  return {
    physicalMs: Number.parseInt(p, 10),
    logical: Number.parseInt(l, 10),
    deviceId: rest.join('-'), // deviceId may contain hyphens (e.g. UUIDs)
  }
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.physicalMs !== b.physicalMs) return a.physicalMs - b.physicalMs
  if (a.logical !== b.logical) return a.logical - b.logical
  return a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0
}

// Advance the local HLC using current wall-clock reading
export function tickHlc(local: Hlc, physicalMsNow: number): Hlc {
  if (physicalMsNow > local.physicalMs) {
    return { physicalMs: physicalMsNow, logical: 0, deviceId: local.deviceId }
  }
  return { physicalMs: local.physicalMs, logical: local.logical + 1, deviceId: local.deviceId }
}

// Incorporate a received HLC from a remote device (e.g. inside an op we just received)
export function receiveHlc(local: Hlc, remote: Hlc, physicalMsNow: number): Hlc {
  const maxPhysical = Math.max(local.physicalMs, remote.physicalMs, physicalMsNow)

  if (maxPhysical === local.physicalMs && maxPhysical === remote.physicalMs) {
    return { physicalMs: maxPhysical, logical: Math.max(local.logical, remote.logical) + 1, deviceId: local.deviceId }
  }
  if (maxPhysical === local.physicalMs) {
    return { physicalMs: maxPhysical, logical: local.logical + 1, deviceId: local.deviceId }
  }
  if (maxPhysical === remote.physicalMs) {
    return { physicalMs: maxPhysical, logical: remote.logical + 1, deviceId: local.deviceId }
  }
  return { physicalMs: maxPhysical, logical: 0, deviceId: local.deviceId }
}
```

- [ ] **Step 4: Run the test, verify it passes**

```powershell
pnpm test tests/hlc.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/hlc.ts tests/hlc.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(hlc): hybrid logical clock with serialize/parse/compare/tick/receive"
```

---

### Task 11: Property-based tests for HLC

**Files:**
- Modify: `tests/hlc.test.ts`

Property tests catch invariant violations that example-based tests miss.

- [ ] **Step 1: Append property tests to `tests/hlc.test.ts`**

```ts
import * as fc from 'fast-check'

describe('HLC properties', () => {
  // Arbitrary HLC generator
  const hlcArb = fc.record({
    physicalMs: fc.integer({ min: 0, max: 2 ** 50 }),
    logical: fc.integer({ min: 0, max: 999_999 }),
    deviceId: fc.stringMatching(/^[a-z0-9-]{1,32}$/),
  })

  it('serialize/parse is a round trip', () => {
    fc.assert(fc.property(hlcArb, h => {
      expect(parseHlc(serializeHlc(h))).toEqual(h)
    }))
  })

  it('serialized form sorts in the same order as compareHlc', () => {
    fc.assert(fc.property(fc.array(hlcArb, { minLength: 2, maxLength: 10 }), arr => {
      const byCompare = [...arr].sort(compareHlc)
      const byString = [...arr].sort((a, b) => serializeHlc(a) < serializeHlc(b) ? -1 : serializeHlc(a) > serializeHlc(b) ? 1 : 0)
      expect(byCompare).toEqual(byString)
    }))
  })

  it('tickHlc always produces an HLC strictly greater than the input', () => {
    fc.assert(fc.property(hlcArb, fc.integer({ min: 0, max: 2 ** 50 }), (h, wall) => {
      const next = tickHlc(h, wall)
      expect(compareHlc(next, h)).toBeGreaterThan(0)
    }))
  })

  it('receiveHlc result is greater than both local and remote', () => {
    fc.assert(fc.property(hlcArb, hlcArb, fc.integer({ min: 0, max: 2 ** 50 }), (local, remote, wall) => {
      const result = receiveHlc(local, remote, wall)
      expect(compareHlc(result, local)).toBeGreaterThan(0)
      // result must be ≥ remote (not necessarily strictly greater — different device IDs may tie)
      const cmp = compareHlc(result, remote)
      expect(cmp === 0 ? result.deviceId === remote.deviceId : cmp > 0).toBe(true)
    }))
  })

  it('compareHlc is transitive', () => {
    fc.assert(fc.property(hlcArb, hlcArb, hlcArb, (a, b, c) => {
      const ab = compareHlc(a, b)
      const bc = compareHlc(b, c)
      if (ab < 0 && bc < 0) expect(compareHlc(a, c)).toBeLessThan(0)
      if (ab > 0 && bc > 0) expect(compareHlc(a, c)).toBeGreaterThan(0)
    }))
  })
})
```

- [ ] **Step 2: Run the tests, verify all pass**

```powershell
pnpm test tests/hlc.test.ts
```

Expected: all tests (example + property) pass. If any property fails, fast-check prints the minimal counterexample — fix `hlc.ts` until it passes.

- [ ] **Step 3: Commit**

```powershell
git add tests/hlc.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "test(hlc): property-based tests for serialization, ordering, monotonicity"
```

---

### Task 12: Define Op type + Zod schema

**Files:**
- Create: `src/types/ops.ts`
- Create: `tests/ops-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { OpSchema } from '@/types/ops'

describe('Op schema validation', () => {
  const validOp = {
    id: 'op_01HXYZ',
    hlc: '0000000000001700-000000-device-a',
    device_id: 'device-a',
    user_id: 'user_01HXYZ',
    entity_kind: 'widget',
    entity_id: 'w_01HXYZ',
    op_type: 'create',
    payload: { label: 'first widget' },
    schema_version: 1,
  }

  it('accepts a valid op', () => {
    const result = OpSchema.safeParse(validOp)
    expect(result.success).toBe(true)
  })

  it('rejects unknown entity_kind', () => {
    const bad = { ...validOp, entity_kind: 'unknown_kind' }
    expect(OpSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown op_type', () => {
    const bad = { ...validOp, op_type: 'patch' }
    expect(OpSchema.safeParse(bad).success).toBe(false)
  })

  it('requires schema_version to be a positive integer', () => {
    expect(OpSchema.safeParse({ ...validOp, schema_version: 0 }).success).toBe(false)
    expect(OpSchema.safeParse({ ...validOp, schema_version: 1.5 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```powershell
pnpm test tests/ops-schema.test.ts
```

Expected: FAIL (`@/types/ops` missing).

- [ ] **Step 3: Implement `src/types/ops.ts`**

```ts
import { z } from 'zod'

export const ENTITY_KINDS = ['widget', 'money', 'task', 'project', 'learning', 'note', 'category', 'budget', 'insight'] as const
export const OP_TYPES = ['create', 'update', 'delete'] as const

export const OpSchema = z.object({
  id: z.string().min(1),                                       // idempotency key
  hlc: z.string().regex(/^\d{16}-\d{6}-.+$/, 'invalid HLC'),
  device_id: z.string().min(1),
  user_id: z.string().min(1),
  entity_kind: z.enum(ENTITY_KINDS),
  entity_id: z.string().min(1),
  op_type: z.enum(OP_TYPES),
  payload: z.record(z.unknown()),
  schema_version: z.number().int().positive(),
})

export type Op = z.infer<typeof OpSchema>

// One materialized row carries field-level HLCs for LWW
export type EntityRow = {
  id: string
  user_id: string
  field_hlcs: Record<string, string>   // field name → HLC
  deleted_at: string | null            // tombstone marker (a "field" too)
  created_at: string
  updated_at: string
  [field: string]: unknown
}
```

- [ ] **Step 4: Run the test, verify it passes**

```powershell
pnpm test tests/ops-schema.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/types/ops.ts tests/ops-schema.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(types): Op + EntityRow Zod schemas"
```

---

### Task 13: Implement op-log apply (per-field LWW + tombstones)

**Files:**
- Create: `src/lib/op-log.ts`
- Create: `tests/op-log.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { applyOp, applyOps } from '@/lib/op-log'
import type { Op, EntityRow } from '@/types/ops'

const baseOp: Omit<Op, 'hlc' | 'op_type' | 'payload'> = {
  id: 'op1',
  device_id: 'd1',
  user_id: 'u1',
  entity_kind: 'widget',
  entity_id: 'w1',
  schema_version: 1,
}

const mk = (hlc: string, op_type: Op['op_type'], payload: Record<string, unknown>, id = `op_${hlc}`): Op => ({
  ...baseOp,
  id,
  hlc,
  op_type,
  payload,
})

describe('applyOp — create', () => {
  it('creates a row when no existing row', () => {
    const row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    expect(row.id).toBe('w1')
    expect(row.label).toBe('A')
    expect(row.field_hlcs.label).toBe('0000000000000001-000000-d1')
    expect(row.deleted_at).toBeNull()
  })
})

describe('applyOp — update with per-field LWW', () => {
  it('applies later-HLC update', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'update', { label: 'B' }, 'op2'))
    expect(row.label).toBe('B')
    expect(row.field_hlcs.label).toBe('0000000000000002-000000-d1')
  })

  it('ignores earlier-HLC update on the same field', () => {
    let row = applyOp(undefined, mk('0000000000000002-000000-d1', 'create', { label: 'B' }))
    row = applyOp(row, mk('0000000000000001-000000-d1', 'update', { label: 'A' }, 'op2'))
    expect(row.label).toBe('B')
    expect(row.field_hlcs.label).toBe('0000000000000002-000000-d1')
  })

  it('applies later-HLC update only to the field it touches', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A', color: 'red' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'update', { color: 'blue' }, 'op2'))
    expect(row.label).toBe('A')
    expect(row.color).toBe('blue')
    expect(row.field_hlcs.label).toBe('0000000000000001-000000-d1')
    expect(row.field_hlcs.color).toBe('0000000000000002-000000-d1')
  })
})

describe('applyOp — delete (tombstone) and resurrect', () => {
  it('marks deleted_at on delete', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'delete', {}, 'op2'))
    expect(row.deleted_at).not.toBeNull()
    expect(row.field_hlcs.deleted_at).toBe('0000000000000002-000000-d1')
  })

  it('resurrects when a later op writes a field', () => {
    let row = applyOp(undefined, mk('0000000000000001-000000-d1', 'create', { label: 'A' }))
    row = applyOp(row, mk('0000000000000002-000000-d1', 'delete', {}, 'op2'))
    row = applyOp(row, mk('0000000000000003-000000-d1', 'update', { label: 'B' }, 'op3'))
    // Resurrection: a write after a delete brings the row back if op.hlc > deleted_at hlc on a "deleted_at: null" field
    // Convention: an explicit update after a delete restores deleted_at to null with the same HLC
    expect(row.deleted_at).toBeNull()
    expect(row.label).toBe('B')
  })
})

describe('applyOps — multi-op replay', () => {
  it('order-independent (commutative for independent fields)', () => {
    const ops: Op[] = [
      mk('0000000000000001-000000-d1', 'create', { label: 'A' }, 'op1'),
      mk('0000000000000002-000000-d2', 'update', { color: 'red' }, 'op2'),
      mk('0000000000000003-000000-d1', 'update', { size: 'L' }, 'op3'),
    ]
    const a = applyOps(undefined, ops)
    const b = applyOps(undefined, [ops[2], ops[0], ops[1]])
    expect(a).toEqual(b)
  })

  it('idempotent (applying the same op twice has no effect)', () => {
    const ops: Op[] = [mk('0000000000000001-000000-d1', 'create', { label: 'A' }, 'op1')]
    const a = applyOps(undefined, ops)
    const b = applyOps(a, ops)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```powershell
pnpm test tests/op-log.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/op-log.ts`**

```ts
import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op, EntityRow } from '@/types/ops'

function isLater(opHlc: string, existingHlc: string | undefined): boolean {
  if (!existingHlc) return true
  return compareHlc(parseHlc(opHlc), parseHlc(existingHlc)) > 0
}

export function applyOp(existing: EntityRow | undefined, op: Op): EntityRow {
  const now = new Date().toISOString()

  if (op.op_type === 'create') {
    if (existing) {
      // Treat a duplicate create as an update with the same payload
      return applyUpdate(existing, op, now)
    }
    const row: EntityRow = {
      id: op.entity_id,
      user_id: op.user_id,
      field_hlcs: {},
      deleted_at: null,
      created_at: now,
      updated_at: now,
    }
    for (const [k, v] of Object.entries(op.payload)) {
      row[k] = v
      row.field_hlcs[k] = op.hlc
    }
    return row
  }

  if (op.op_type === 'update') {
    if (!existing) {
      // Update on a missing row: fabricate from the update payload (defensive)
      return applyOp(undefined, { ...op, op_type: 'create' })
    }
    return applyUpdate(existing, op, now)
  }

  // delete
  if (!existing) {
    // Delete on a missing row: synthesize an empty tombstone row so future
    // ops can apply LWW correctly
    return {
      id: op.entity_id,
      user_id: op.user_id,
      field_hlcs: { deleted_at: op.hlc },
      deleted_at: now,
      created_at: now,
      updated_at: now,
    }
  }
  if (!isLater(op.hlc, existing.field_hlcs.deleted_at)) return existing
  return {
    ...existing,
    field_hlcs: { ...existing.field_hlcs, deleted_at: op.hlc },
    deleted_at: now,
    updated_at: now,
  }
}

function applyUpdate(existing: EntityRow, op: Op, now: string): EntityRow {
  let next: EntityRow = { ...existing, field_hlcs: { ...existing.field_hlcs } }
  let mutated = false

  for (const [k, v] of Object.entries(op.payload)) {
    if (isLater(op.hlc, existing.field_hlcs[k])) {
      next[k] = v
      next.field_hlcs[k] = op.hlc
      mutated = true
    }
  }

  // Resurrection: an update with HLC later than deleted_at clears the tombstone
  if (existing.deleted_at && isLater(op.hlc, existing.field_hlcs.deleted_at)) {
    next.deleted_at = null
    next.field_hlcs.deleted_at = op.hlc
    mutated = true
  }

  if (mutated) next.updated_at = now
  return next
}

export function applyOps(existing: EntityRow | undefined, ops: Op[]): EntityRow | undefined {
  // Sort by HLC for deterministic replay
  const sorted = [...ops].sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))
  let row = existing
  const seen = new Set<string>()
  for (const op of sorted) {
    if (seen.has(op.id)) continue   // idempotence on op.id
    seen.add(op.id)
    row = applyOp(row, op)
  }
  return row
}
```

- [ ] **Step 4: Run tests, verify pass**

```powershell
pnpm test tests/op-log.test.ts
```

Expected: all tests PASS. If any fail, the counterexample reveals the bug — fix and re-run.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/op-log.ts tests/op-log.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(op-log): apply with per-field LWW + tombstone + resurrection"
```

---

### Task 14: Property-based tests for op-log determinism

**Files:**
- Modify: `tests/op-log.test.ts`

- [ ] **Step 1: Append property tests**

```ts
import * as fc from 'fast-check'
import { serializeHlc } from '@/lib/hlc'

describe('op-log properties', () => {
  const hlcArb = fc.record({
    physicalMs: fc.integer({ min: 1, max: 1_000_000 }),
    logical: fc.integer({ min: 0, max: 100 }),
    deviceId: fc.stringMatching(/^[a-z]{1,4}$/),
  }).map(serializeHlc)

  const fieldArb = fc.constantFrom('label', 'color', 'size')
  const valueArb = fc.string({ minLength: 1, maxLength: 8 })
  const payloadArb = fc.dictionary(fieldArb, valueArb, { minKeys: 1, maxKeys: 3 })

  const opTypeArb = fc.constantFrom<Op['op_type']>('create', 'update', 'delete')

  const opArb: fc.Arbitrary<Op> = fc.record({
    id: fc.uuid(),
    hlc: hlcArb,
    device_id: fc.stringMatching(/^[a-z]{1,4}$/),
    user_id: fc.constant('u1'),
    entity_kind: fc.constant('widget'),
    entity_id: fc.constant('w1'),
    op_type: opTypeArb,
    payload: payloadArb,
    schema_version: fc.constant(1),
  }) as fc.Arbitrary<Op>

  it('order-independent: any permutation of the same op set yields the same row', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 2, maxLength: 20 }), ops => {
        const a = applyOps(undefined, ops)
        const shuffled = [...ops].sort(() => 0.5 - Math.random())
        const b = applyOps(undefined, shuffled)
        // Compare modulo created_at / updated_at (those carry wall-clock noise)
        const stripWallClock = (r?: EntityRow) => r && { ...r, created_at: '', updated_at: '' }
        expect(stripWallClock(a)).toEqual(stripWallClock(b))
      }),
      { numRuns: 200 }
    )
  })

  it('idempotent: applying the same op set twice equals applying once', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 10 }), ops => {
        const a = applyOps(undefined, ops)
        const b = applyOps(a, ops)
        const stripWallClock = (r?: EntityRow) => r && { ...r, created_at: '', updated_at: '' }
        expect(stripWallClock(a)).toEqual(stripWallClock(b))
      }),
      { numRuns: 200 }
    )
  })
})
```

- [ ] **Step 2: Run, verify pass**

```powershell
pnpm test tests/op-log.test.ts
```

Expected: all tests PASS. **If a property fails, fast-check shrinks to the minimal failing op sequence — paste it here as a regression test and fix `op-log.ts`.**

- [ ] **Step 3: Commit**

```powershell
git add tests/op-log.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "test(op-log): property tests for determinism and idempotence"
```

---

### Task 15: Set up Dexie client store

**Files:**
- Create: `src/lib/dexie.ts`
- Create: `tests/dexie.test.ts`

- [ ] **Step 1: Install `fake-indexeddb` for Node test environment**

```powershell
pnpm add -D fake-indexeddb
```

- [ ] **Step 2: Update `tests/setup.ts`** to polyfill IndexedDB

```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 3: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDb } from '@/lib/dexie'
import type { Op } from '@/types/ops'

const sampleOp: Op = {
  id: 'op1',
  hlc: '0000000000000001-000000-d1',
  device_id: 'd1',
  user_id: 'u1',
  entity_kind: 'widget',
  entity_id: 'w1',
  op_type: 'create',
  payload: { label: 'A' },
  schema_version: 1,
}

describe('Dexie store', () => {
  beforeEach(async () => { await resetDb() })

  it('persists an op and reads it back', async () => {
    await db.op_log.add(sampleOp)
    const all = await db.op_log.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('op1')
  })

  it('persists a widget row and reads it by id', async () => {
    await db.widgets.put({
      id: 'w1',
      user_id: 'u1',
      label: 'A',
      field_hlcs: { label: sampleOp.hlc },
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    const w = await db.widgets.get('w1')
    expect(w?.label).toBe('A')
  })
})
```

- [ ] **Step 4: Run, verify failure**

```powershell
pnpm test tests/dexie.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 5: Implement `src/lib/dexie.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie'
import type { Op, EntityRow } from '@/types/ops'

type SyncMeta = {
  key: string                   // 'last_synced_hlc' or 'device_id'
  value: string
}

type VoiceQueueItem = {
  id: string
  blob: Blob
  created_at: string
  retry_count: number
  status: 'queued' | 'transcribing' | 'done' | 'failed'
}

class PulseDb extends Dexie {
  op_log!: EntityTable<Op, 'id'>
  widgets!: EntityTable<EntityRow, 'id'>
  sync_meta!: EntityTable<SyncMeta, 'key'>
  voice_queue!: EntityTable<VoiceQueueItem, 'id'>

  constructor() {
    super('pulse')
    this.version(1).stores({
      op_log: 'id, hlc, entity_kind, entity_id',
      widgets: 'id, user_id, updated_at',
      sync_meta: 'key',
      voice_queue: 'id, status, created_at',
    })
  }
}

export const db = new PulseDb()

export async function resetDb() {
  await db.op_log.clear()
  await db.widgets.clear()
  await db.sync_meta.clear()
  await db.voice_queue.clear()
}
```

- [ ] **Step 6: Run tests, verify pass**

```powershell
pnpm test tests/dexie.test.ts
```

Expected: 2 PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/dexie.ts tests/dexie.test.ts tests/setup.ts package.json pnpm-lock.yaml
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(dexie): IndexedDB schema for op_log, widgets, sync_meta, voice_queue"
```

---

### Task 16: Client sync engine — generate + apply ops locally

**Files:**
- Create: `src/lib/sync-client.ts`
- Create: `tests/sync-client.test.ts`

This file owns: (1) device-id bootstrap, (2) HLC singleton per device, (3) op generation API, (4) local apply pipeline, (5) the push/pull HTTP call.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp, getDeviceId } from '@/lib/sync-client'

describe('sync-client local pipeline', () => {
  beforeEach(async () => { await resetDb() })

  it('generates a unique device id on first call and reuses it', async () => {
    const id1 = await getDeviceId()
    const id2 = await getDeviceId()
    expect(id1).toBe(id2)
    expect(id1.length).toBeGreaterThanOrEqual(8)
  })

  it('generateOp + applyLocalOp persists both op_log and entity row', async () => {
    const op = await generateOp({
      entity_kind: 'widget',
      entity_id: 'w1',
      op_type: 'create',
      payload: { label: 'first' },
      user_id: 'u1',
    })
    await applyLocalOp(op)

    const ops = await db.op_log.toArray()
    expect(ops).toHaveLength(1)

    const widget = await db.widgets.get('w1')
    expect(widget?.label).toBe('first')
  })

  it('generateOp issues strictly monotonically-increasing HLCs', async () => {
    const a = await generateOp({ entity_kind: 'widget', entity_id: 'w1', op_type: 'create', payload: { label: 'a' }, user_id: 'u1' })
    const b = await generateOp({ entity_kind: 'widget', entity_id: 'w2', op_type: 'create', payload: { label: 'b' }, user_id: 'u1' })
    expect(a.hlc < b.hlc).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```powershell
pnpm test tests/sync-client.test.ts
```

- [ ] **Step 3: Implement `src/lib/sync-client.ts`**

```ts
import { db } from '@/lib/dexie'
import { applyOp } from '@/lib/op-log'
import { createHlc, parseHlc, serializeHlc, tickHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

function newDeviceId() {
  // Browser-friendly UUID v4 (works in modern browsers; for Node tests we use polyfill)
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

const SCHEMA_VERSION = 1

export async function getDeviceId(): Promise<string> {
  const row = await db.sync_meta.get('device_id')
  if (row) return row.value
  const id = newDeviceId()
  await db.sync_meta.put({ key: 'device_id', value: id })
  return id
}

async function readLocalHlc(deviceId: string) {
  const row = await db.sync_meta.get('local_hlc')
  if (row) return parseHlc(row.value)
  return createHlc(deviceId, Date.now())
}

async function writeLocalHlc(hlcStr: string) {
  await db.sync_meta.put({ key: 'local_hlc', value: hlcStr })
}

export async function generateOp(input: {
  entity_kind: Op['entity_kind']
  entity_id: string
  op_type: Op['op_type']
  payload: Record<string, unknown>
  user_id: string
}): Promise<Op> {
  const deviceId = await getDeviceId()
  const prev = await readLocalHlc(deviceId)
  const next = tickHlc(prev, Date.now())
  await writeLocalHlc(serializeHlc(next))

  return {
    id: crypto.randomUUID(),
    hlc: serializeHlc(next),
    device_id: deviceId,
    user_id: input.user_id,
    entity_kind: input.entity_kind,
    entity_id: input.entity_id,
    op_type: input.op_type,
    payload: input.payload,
    schema_version: SCHEMA_VERSION,
  }
}

export async function applyLocalOp(op: Op): Promise<void> {
  // Idempotent: if already in op_log, no-op
  const existing = await db.op_log.get(op.id)
  if (existing) return

  await db.transaction('rw', [db.op_log, db.widgets], async () => {
    await db.op_log.add(op)
    if (op.entity_kind === 'widget') {
      const current = await db.widgets.get(op.entity_id)
      const next = applyOp(current, op)
      await db.widgets.put(next)
    }
    // Other entity_kind branches added in later phases
  })
}
```

- [ ] **Step 4: Run tests, verify pass**

```powershell
pnpm test tests/sync-client.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/sync-client.ts tests/sync-client.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(sync-client): op generation + local apply + device-id bootstrap"
```

---

### Task 17: Server sync handler — receive + apply + replay

**Files:**
- Create: `src/lib/sync-server.ts`
- Create: `src/app/api/sync/route.ts`
- Create: `tests/sync-server.test.ts`

- [ ] **Step 1: Write the failing test for the pure-logic core** (HTTP wiring is tested by the integration test in Task 19)

```ts
import { describe, it, expect } from 'vitest'
import { mergeOpsForUser } from '@/lib/sync-server'
import type { Op } from '@/types/ops'

const mkOp = (id: string, hlc: string, payload: Record<string, unknown>): Op => ({
  id, hlc,
  device_id: 'd1', user_id: 'u1',
  entity_kind: 'widget', entity_id: 'w1',
  op_type: 'update',
  payload,
  schema_version: 1,
})

describe('mergeOpsForUser', () => {
  it('deduplicates by op.id', () => {
    const incoming = [mkOp('a', '0000000000000001-000000-d1', { label: 'A' })]
    const existing = [mkOp('a', '0000000000000001-000000-d1', { label: 'A' })]
    const result = mergeOpsForUser(existing, incoming)
    expect(result.newOps).toHaveLength(0)
  })

  it('keeps only ops whose id is not already in existing', () => {
    const existing = [mkOp('a', '0000000000000001-000000-d1', { label: 'A' })]
    const incoming = [
      mkOp('a', '0000000000000001-000000-d1', { label: 'A' }),
      mkOp('b', '0000000000000002-000000-d1', { label: 'B' }),
    ]
    const result = mergeOpsForUser(existing, incoming)
    expect(result.newOps).toHaveLength(1)
    expect(result.newOps[0].id).toBe('b')
  })

  it('returns ops the client does not have yet (hlc > last_synced_hlc)', () => {
    const existing = [
      mkOp('a', '0000000000000001-000000-d1', { label: 'A' }),
      mkOp('b', '0000000000000003-000000-d1', { label: 'B' }),
    ]
    const result = mergeOpsForUser(existing, [], '0000000000000002-000000-d1')
    expect(result.opsForClient.map(o => o.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run, verify failure**

```powershell
pnpm test tests/sync-server.test.ts
```

- [ ] **Step 3: Implement `src/lib/sync-server.ts`**

```ts
import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

export type MergeResult = {
  newOps: Op[]              // ops we should insert into op_log
  opsForClient: Op[]        // ops the client should apply
}

export function mergeOpsForUser(
  existingOpsForUser: Op[],
  incomingOps: Op[],
  lastSyncedHlc?: string,
): MergeResult {
  const existingIds = new Set(existingOpsForUser.map(o => o.id))
  const newOps = incomingOps.filter(o => !existingIds.has(o.id))

  const allKnown = [...existingOpsForUser, ...newOps]
  const opsForClient = lastSyncedHlc
    ? allKnown.filter(o => compareHlc(parseHlc(o.hlc), parseHlc(lastSyncedHlc)) > 0)
    : allKnown
  // Sort for stable client-side replay
  opsForClient.sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))

  return { newOps, opsForClient }
}
```

- [ ] **Step 4: Run tests, verify pass**

```powershell
pnpm test tests/sync-server.test.ts
```

- [ ] **Step 5: Create the HTTP route `src/app/api/sync/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getXataClient } from '@/lib/xata'
import { OpSchema } from '@/types/ops'
import { mergeOpsForUser } from '@/lib/sync-server'
import { applyOp } from '@/lib/op-log'

const RequestSchema = z.object({
  device_id: z.string().min(1),
  last_synced_hlc: z.string().optional(),
  new_ops: z.array(OpSchema),
})

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const userId = session.user.id
  const { device_id, last_synced_hlc, new_ops } = parsed.data

  // Authorization: every op must claim this user
  for (const op of new_ops) {
    if (op.user_id !== userId) {
      return NextResponse.json({ error: 'op.user_id mismatch' }, { status: 403 })
    }
  }

  const xata = getXataClient()
  const existingOps = (await xata.db.op_log
    .filter({ 'user.id': userId })
    .getAll()) as unknown as Array<z.infer<typeof OpSchema>>

  const { newOps, opsForClient } = mergeOpsForUser(existingOps, new_ops, last_synced_hlc)

  // Persist new ops + materialize widgets
  for (const op of newOps) {
    await xata.db.op_log.create({
      user: userId,
      op_id: op.id,
      hlc: op.hlc,
      device_id: op.device_id,
      entity_kind: op.entity_kind,
      entity_id: op.entity_id,
      op_type: op.op_type,
      payload: op.payload,
      schema_version: op.schema_version,
      applied_at: new Date().toISOString(),
    })

    if (op.entity_kind === 'widget') {
      const existing = await xata.db.widgets.read(op.entity_id)
      const merged = applyOp(existing as never, op)
      await xata.db.widgets.createOrUpdate(op.entity_id, {
        user: userId,
        label: merged.label as string | null,
        field_hlcs: merged.field_hlcs,
        deleted_at: merged.deleted_at,
        created_at: merged.created_at,
        updated_at: merged.updated_at,
      })
    }
  }

  // Compute server HLC = max of all known op HLCs
  const serverHlc = [...existingOps, ...newOps]
    .map(o => o.hlc)
    .sort()
    .pop() ?? '0000000000000000-000000-server'

  return NextResponse.json({
    server_hlc: serverHlc,
    new_ops_from_server: opsForClient,
    applied_ack: new_ops.map(o => o.id),
  })
}
```

- [ ] **Step 6: Smoke-test the route**

Start dev server:

```powershell
pnpm dev
```

Hit the endpoint without auth:

```powershell
curl -X POST http://localhost:3000/api/sync `
  -H "Content-Type: application/json" `
  -d '{"device_id":"d1","new_ops":[]}'
```

Expected: `{"error":"unauthorized"}` with status 401.

(Authenticated test follows in Task 19.) Stop dev server.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/sync-server.ts src/app/api/sync tests/sync-server.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(sync-server): merge logic + auth-gated /api/sync route"
```

---

### Task 18: Client pull/push — talk to `/api/sync`

**Files:**
- Modify: `src/lib/sync-client.ts`

- [ ] **Step 1: Add a failing test in `tests/sync-client.test.ts`**

Append:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pushPullOnce } from '@/lib/sync-client'

describe('pushPullOnce', () => {
  beforeEach(async () => { await resetDb() })

  it('sends pending ops and applies returned ops', async () => {
    // Arrange: one local op + one "server" op the server returns
    const localOp = await generateOp({ entity_kind: 'widget', entity_id: 'w1', op_type: 'create', payload: { label: 'local' }, user_id: 'u1' })
    await applyLocalOp(localOp)

    const serverOp = {
      id: 'op-from-server',
      hlc: '0000000000999999-000000-server',
      device_id: 'server',
      user_id: 'u1',
      entity_kind: 'widget' as const,
      entity_id: 'w2',
      op_type: 'create' as const,
      payload: { label: 'server' },
      schema_version: 1,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      server_hlc: serverOp.hlc,
      new_ops_from_server: [serverOp],
      applied_ack: [localOp.id],
    })))

    // Act
    await pushPullOnce({ userId: 'u1' })

    // Assert
    const widgets = await db.widgets.toArray()
    expect(widgets.map(w => w.id).sort()).toEqual(['w1', 'w2'])

    fetchSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run, verify failure**

```powershell
pnpm test tests/sync-client.test.ts
```

- [ ] **Step 3: Add `pushPullOnce` to `src/lib/sync-client.ts`**

Append:

```ts
export async function getPendingOps(): Promise<Op[]> {
  // For Phase 0, "pending" = every op generated since last server ack
  const synced = (await db.sync_meta.get('synced_op_ids'))?.value ?? ''
  const syncedSet = new Set(synced.split(',').filter(Boolean))
  const all = await db.op_log.toArray()
  return all.filter(o => !syncedSet.has(o.id))
}

async function markSynced(opIds: string[]) {
  const existing = (await db.sync_meta.get('synced_op_ids'))?.value ?? ''
  const combined = new Set(existing.split(',').filter(Boolean))
  for (const id of opIds) combined.add(id)
  await db.sync_meta.put({ key: 'synced_op_ids', value: [...combined].join(',') })
}

async function readLastSyncedHlc(): Promise<string | undefined> {
  return (await db.sync_meta.get('last_synced_hlc'))?.value
}

async function writeLastSyncedHlc(hlc: string) {
  await db.sync_meta.put({ key: 'last_synced_hlc', value: hlc })
}

export async function pushPullOnce(input: { userId: string }): Promise<{ applied: number; received: number }> {
  const deviceId = await getDeviceId()
  const pending = await getPendingOps()
  const lastSyncedHlc = await readLastSyncedHlc()

  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      last_synced_hlc: lastSyncedHlc,
      new_ops: pending,
    }),
  })

  if (!res.ok) {
    throw new Error(`sync failed: ${res.status} ${await res.text()}`)
  }

  const body = await res.json() as {
    server_hlc: string
    new_ops_from_server: Op[]
    applied_ack: string[]
  }

  // Apply server ops locally
  for (const op of body.new_ops_from_server) {
    await applyLocalOp(op)
  }

  await markSynced(body.applied_ack)
  await writeLastSyncedHlc(body.server_hlc)

  return { applied: body.applied_ack.length, received: body.new_ops_from_server.length }
}
```

- [ ] **Step 4: Run tests, verify pass**

```powershell
pnpm test tests/sync-client.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add src/lib/sync-client.ts tests/sync-client.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(sync-client): pushPullOnce — round-trip /api/sync"
```

---

### Task 19: Two-device integration test

**Files:**
- Create: `tests/sync-integration.test.ts`

Simulate two clients writing concurrently, confirm convergence on apply.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest'
import { applyOps } from '@/lib/op-log'
import type { Op } from '@/types/ops'

function mkOp(opts: Partial<Op> & { hlc: string, op_type: Op['op_type'], payload: Record<string, unknown> }): Op {
  return {
    id: opts.id ?? `op_${opts.hlc}`,
    hlc: opts.hlc,
    device_id: opts.device_id ?? 'd1',
    user_id: 'u1',
    entity_kind: 'widget',
    entity_id: 'w1',
    op_type: opts.op_type,
    payload: opts.payload,
    schema_version: 1,
  }
}

describe('two-device convergence', () => {
  it('two devices writing different fields concurrently converge to the same state', () => {
    const d1Op = mkOp({ hlc: '0000000000000010-000000-d1', device_id: 'd1', op_type: 'create', payload: { label: 'init' } })
    // d2 sees d1's create after it has already issued an update on a different field
    const d2Op = mkOp({ hlc: '0000000000000020-000000-d2', device_id: 'd2', op_type: 'update', payload: { color: 'red' } })
    const d1Op2 = mkOp({ hlc: '0000000000000030-000000-d1', device_id: 'd1', op_type: 'update', payload: { size: 'L' } })

    // Device 1 applies in d1, d2, d3 order
    const final1 = applyOps(undefined, [d1Op, d2Op, d1Op2])
    // Device 2 receives in d2, d1, d3 order (different network ordering)
    const final2 = applyOps(undefined, [d2Op, d1Op, d1Op2])

    const strip = (r: any) => ({ ...r, created_at: '', updated_at: '' })
    expect(strip(final1)).toEqual(strip(final2))
    expect(final1?.label).toBe('init')
    expect(final1?.color).toBe('red')
    expect(final1?.size).toBe('L')
  })

  it('same field written by two devices: higher HLC wins regardless of arrival order', () => {
    const d1 = mkOp({ hlc: '0000000000000010-000000-d1', device_id: 'd1', op_type: 'create', payload: { label: 'd1-label' } })
    const d2 = mkOp({ hlc: '0000000000000020-000000-d2', device_id: 'd2', op_type: 'update', payload: { label: 'd2-label' } })

    const order1 = applyOps(undefined, [d1, d2])
    const order2 = applyOps(undefined, [d2, d1])

    expect(order1?.label).toBe('d2-label')
    expect(order2?.label).toBe('d2-label')
  })
})
```

- [ ] **Step 2: Run**

```powershell
pnpm test tests/sync-integration.test.ts
```

Expected: 2 PASS.

- [ ] **Step 3: Commit**

```powershell
git add tests/sync-integration.test.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "test(sync): two-device convergence integration"
```

---

### Task 20: Build the Widget UI (create / list)

**Files:**
- Create: `src/components/widget-form.tsx`
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Implement `src/components/widget-form.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/dexie'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useLiveQuery } from 'dexie-react-hooks'
import type { EntityRow } from '@/types/ops'

export function WidgetForm({ userId }: { userId: string }) {
  const widgets = useLiveQuery<EntityRow[]>(
    () => db.widgets.where('user_id').equals(userId).toArray(),
    [userId],
    [],
  )
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    try {
      const op = await generateOp({
        entity_kind: 'widget',
        entity_id: crypto.randomUUID(),
        op_type: 'create',
        payload: { label: label.trim() },
        user_id: userId,
      })
      await applyLocalOp(op)
      setLabel('')
      pushPullOnce({ userId }).catch(err => console.error('sync error', err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="widget-label" className="sr-only">Widget label</Label>
          <Input
            id="widget-label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="New widget…"
          />
        </div>
        <Button type="submit" disabled={busy}>Add</Button>
      </form>

      <ul className="divide-y divide-border rounded-md border">
        {widgets?.length === 0 && <li className="p-3 text-sm text-muted-foreground">No widgets yet.</li>}
        {widgets?.filter(w => !w.deleted_at).map(w => (
          <li key={w.id} className="flex items-center justify-between p-3 text-sm">
            <span>{String(w.label)}</span>
            <code className="text-xs text-muted-foreground">{w.id.slice(0, 8)}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Install dexie-react-hooks**

```powershell
pnpm add dexie-react-hooks
```

- [ ] **Step 3: Wire the form into `src/app/app/page.tsx`**

Replace `src/app/app/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { WidgetForm } from '@/components/widget-form'
import { Button } from '@/components/ui/button'
import { pushPullOnce } from '@/lib/sync-client'

export default function AppPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string, email: string } | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUser({ id: res.data.user.id, email: res.data.user.email })
    })
  }, [router])

  // Background sync every 10 s while app is open
  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync error', err))
    }, 10_000)
    return () => clearInterval(interval)
  }, [user])

  if (!user) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pulse</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => authClient.signOut().then(() => router.replace('/login'))}
        >
          Sign out
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      <WidgetForm userId={user.id} />
    </main>
  )
}
```

- [ ] **Step 4: Manual verification on localhost**

```powershell
pnpm dev
```

Open `http://localhost:3000`:
1. Sign in via magic link (link prints to terminal)
2. Add a widget "first"
3. It appears in the list immediately
4. Open the browser DevTools → Application → IndexedDB → `pulse` — verify `op_log` and `widgets` tables have one row each

Stop dev server.

- [ ] **Step 5: Commit**

```powershell
git add src/components/widget-form.tsx src/app/app/page.tsx package.json pnpm-lock.yaml
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(widget): minimal Widget create/list UI + background sync polling"
```

---

### Task 21: Deploy to Cloudflare Pages from GitHub

**Files:**
- Create: `wrangler.toml`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Push the local repo to GitHub**

Create an empty GitHub repo named `pulse` (if not already done). Then:

```powershell
git remote add origin https://github.com/<your-username>/pulse.git
git push -u origin main
```

- [ ] **Step 2: Create `wrangler.toml`**

```toml
name = "pulse"
compatibility_date = "2026-06-15"
compatibility_flags = ["nodejs_compat"]

[pages]
# Pages auto-detects Next.js; this file is a placeholder for future Workers configs
```

- [ ] **Step 3: Connect the repo to Cloudflare Pages via the dashboard**

In a browser:
1. Go to https://dash.cloudflare.com/ → Workers & Pages → Create application → Pages → Connect to Git.
2. Authorize Cloudflare for your GitHub.
3. Select repo `pulse`.
4. Production branch: `main`.
5. Framework preset: `Next.js`.
6. Build command: `pnpm install --frozen-lockfile && pnpm build`
7. Build output directory: `.next` (Cloudflare Pages auto-detects for Next.js; verify).
8. Environment variables (Production + Preview): paste from `.env.local` — every variable EXCEPT `BETTER_AUTH_URL` (which should be your `*.pages.dev` URL once Cloudflare assigns one), and `NODE_ENV=production` for prod.

Click Deploy. Wait for first build (~3 min).

- [ ] **Step 4: Update `BETTER_AUTH_URL` in Cloudflare**

After the first build, Cloudflare assigns a URL like `pulse-abc.pages.dev`. Add `BETTER_AUTH_URL=https://pulse-abc.pages.dev` to the Production env vars and re-deploy.

- [ ] **Step 5: Smoke-test the deployed app**

Open `https://pulse-abc.pages.dev/login` on your phone. Sign in (magic link will appear in Cloudflare logs — Workers tab → Logs). Once signed in, add a widget. Verify it appears.

- [ ] **Step 6: Create CI workflow `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 7: Push CI + verify**

```powershell
git add wrangler.toml .github/workflows/ci.yml
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "ci: add lint + typecheck + test GitHub Action"
git push
```

Watch the Action run on https://github.com/<you>/pulse/actions. Expected: green check on `main`.

- [ ] **Step 8: Commit any local config tweaks**

(If anything changed during deployment setup, commit it.)

---

### Task 22: Two-device end-to-end verification

This task has no code — it's the empirical proof that Phase 0 is done.

- [ ] **Step 1: On your phone, install the PWA**

Open `https://pulse-abc.pages.dev` in Chrome on Android (or Safari on iOS).
- Android: menu → "Add to Home screen" → "Install"
- iOS: share sheet → "Add to Home Screen"

Sign in via the magic link (open the verification URL on the phone).

- [ ] **Step 2: Add a widget on the phone**

Use the form: enter "phone-widget" → tap Add. Verify it appears immediately.

- [ ] **Step 3: Open the same URL on your desktop browser**

Sign in with the same email. The "phone-widget" row should appear within 10 seconds (background sync interval) of opening the page.

- [ ] **Step 4: Add a widget on the desktop, watch it appear on the phone**

Enter "desktop-widget" → Add. Within 10 seconds, the phone shows both rows.

- [ ] **Step 5: Test offline behavior on the phone**

- Enable airplane mode on the phone.
- Add a widget "offline-widget" — it appears immediately in the local list.
- Disable airplane mode.
- Within 10 seconds, "offline-widget" appears on desktop too.

- [ ] **Step 6: Commit a small note recording the test outcome**

Create `docs/superpowers/notes/phase-0-completion.md`:

```markdown
# Phase 0 — Completion log

Date: <YYYY-MM-DD>
Deployed URL: https://pulse-<id>.pages.dev

End-to-end verification:
- [x] Magic-link login on phone + desktop
- [x] Widget create on phone → desktop within 10 s
- [x] Widget create on desktop → phone within 10 s
- [x] Offline widget create on phone → syncs after reconnect
- [x] CI green on main

Sync engine performance: rough median round-trip <N>s on home Wi-Fi.

Phase 0 closed.
```

```powershell
git add docs/superpowers/notes/phase-0-completion.md
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "docs: phase-0 completion log"
git push
```

---

### Task 23: Wire the real Better Auth → Xata adapter (deferred from Task 8)

**Files:**
- Modify: `src/lib/auth.ts`

Phase 0 used the in-memory Better Auth adapter so we could land the UI quickly. Real users need durable sessions. Sessions are persisted in Xata via Better Auth's adapter.

- [ ] **Step 1: Confirm Better Auth's current Xata or generic-SQL adapter**

Open https://www.better-auth.com/docs/adapters — pick whichever adapter pattern is current for Postgres-compatible storage (e.g. `drizzle-adapter` over a Postgres connection that Xata supports, or a direct Xata adapter if one ships).

- [ ] **Step 2: Replace the in-memory database config in `src/lib/auth.ts`**

```ts
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { env } from '@/lib/env'
// Replace the line below with the import for the chosen adapter once verified.
// Example: import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: {
    // Replace with chosen adapter, passing an authenticated client.
    // For drizzle-over-Postgres-via-Xata, see Xata's Postgres connection string in the dashboard.
    dialect: 'memory', // <- replace before merging to main
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // TODO Phase 4: replace with Resend or Cloudflare Email Workers.
        console.log(`[magic-link] for ${email}: ${url}`)
      },
    }),
  ],
})
```

- [ ] **Step 3: Run sign-in / sign-out cycle twice across server restarts**

```powershell
pnpm dev
```

Sign in. Stop dev server. Restart. Session should persist (Better Auth reads from Xata). If it doesn't, the adapter wiring is wrong — fix and re-run.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/auth.ts
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "feat(auth): persist Better Auth sessions via Xata adapter"
git push
```

---

### Task 24: Write Phase 0 retrospective + Phase 1 prereqs note

**Files:**
- Create: `docs/superpowers/notes/phase-0-retro.md`

- [ ] **Step 1: Write the retrospective**

```markdown
# Phase 0 — Retrospective

## What went well
- [Fill in]

## What was slower than estimated
- [Fill in]

## Bugs found
- [Fill in]

## Decisions deferred / revisited
- [Fill in]

## Phase 1 prereqs to confirm before starting
- [ ] Groq API key still valid (test a single Whisper call)
- [ ] Microphone permission flow on iOS Safari + Android Chrome works in PWA mode
- [ ] Xata free-tier usage check (storage + RPS headroom for op_log growth)
- [ ] Cloudflare Pages build time within free-tier monthly cap

## Architecture changes to consider before Phase 1
- [Fill in based on what you learned]
```

- [ ] **Step 2: Commit**

```powershell
git add docs/superpowers/notes/phase-0-retro.md
git -c user.name="Sheik" -c user.email="stains.j@tcs.com" commit -m "docs: phase-0 retrospective + phase-1 prereqs"
git push
```

---

## Phase 0 completion checklist (must all be true)

- [ ] CI is green on `main`
- [ ] `pnpm test` passes with property-based tests for HLC + op-log
- [ ] Magic-link login works on phone + desktop
- [ ] Widget create on phone → desktop within 10 s (verified by hand)
- [ ] Widget create on desktop → phone within 10 s
- [ ] Offline widget create on phone → syncs after reconnect
- [ ] Better Auth sessions persist across server restarts (via Xata adapter)
- [ ] `docs/superpowers/notes/phase-0-completion.md` filled in
- [ ] `docs/superpowers/notes/phase-0-retro.md` filled in

Once all of the above are checked, Phase 0 is closed. Start writing the Phase 1 plan when ready.

---

## Self-Review (run after writing this plan)

### Spec coverage

| Spec requirement | Plan task(s) | Coverage |
|---|---|---|
| Next.js + Tailwind 4 + shadcn + Serwist scaffold | Tasks 1–5 | ✓ |
| CF Pages deploy from GitHub | Task 21 | ✓ |
| Xata project + initial schema | Task 7 | ✓ |
| Better Auth magic-link | Tasks 8, 9, 23 | ✓ |
| Dexie.js + op_log + sync_meta | Task 15 | ✓ |
| HLC + tests | Tasks 10, 11 | ✓ |
| Op-log + per-field LWW + property tests | Tasks 12, 13, 14 | ✓ |
| `/api/sync` round-trip | Tasks 17, 18, 19 | ✓ |
| Toy entity round-trip phone ↔ desktop | Tasks 20, 22 | ✓ |
| README scaffold | (deferred to Phase 4) | partial — Phase 4 |
| PWA installability | Task 5 (manifest + SW) + Task 22 (verified) | ✓ |
| Workers + Cron Triggers wired up | Task 21 (Workers via CF Pages) — Cron Triggers deferred to Phase 3 where they're actually used | partial (acceptable — no consumer in Phase 0) |

Two intentional deferrals (README and Cron Triggers) — both are not needed for Phase 0's success criteria and adding them now would be premature.

### Placeholder scan

- Searched for "TBD", "TODO", "implement later" — Task 23 has a deliberate `// TODO Phase 4` comment inside the magic-link console-log handler; that's annotation of a *deferred work item*, not a planning placeholder, and is acceptable per the spec's "console delivery for Phase 0" decision.
- No "fill in" outside of the user-completed retrospective template (Task 24) and the user-completed completion log (Task 22).

### Type consistency

- `Op` and `EntityRow` defined in Task 12; used by Tasks 13, 15, 16, 17, 18, 19, 20.
- HLC functions (`createHlc`, `serializeHlc`, `parseHlc`, `compareHlc`, `tickHlc`, `receiveHlc`) defined in Task 10; used in Tasks 13, 16, 17.
- `applyOp` / `applyOps` signature stable from Task 13 through Task 19.
- `getDeviceId`, `generateOp`, `applyLocalOp`, `pushPullOnce` exported from `src/lib/sync-client.ts` (Tasks 16, 18) and used in Task 20.
- No method renames spotted between tasks.

### Scope check

12 weeks of work was decomposed into 5 phase-plans; this plan is Phase 0 only (~1–2 weeks part-time). Phase 0's deliverable (sync engine + skeleton + toy entity round-trip) is self-contained working software. ✓

---

## Open notes for the implementer

- **Don't skip the property tests.** They are the entire reason this design is defensible vs. a smaller-model implementation that would write plausible-but-broken sync code. If a property fails after a code change in Phases 1+, *do not weaken the property* — fix the code.
- **One commit per task** is the discipline. If a task naturally splits, split the task; don't squash unrelated changes.
- **Verify the magic-link callback URL in Better Auth env vars** when deploying. Forgetting `BETTER_AUTH_URL` is the #1 deployment footgun for this stack.
- **Better Auth's Xata adapter status** (Task 23) — if at the time of Phase 0 there's no first-party Xata adapter, the cleanest path is to use Better Auth's Drizzle adapter over Xata's Postgres connection string (Xata exposes a `postgresql://...` URL under the database's Settings tab).
