# Pulse Auth — Passkey + PIN + Durable Session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in on the iOS PWA in one biometric tap (passkey), stay signed in across daily opens (1-year sliding session), gate the offline app behind a fast local PIN, with real emailed magic links (Resend) for bootstrap/recovery.

**Architecture:** Three independent layers over the existing Better Auth setup — a durable HttpOnly session cookie, a WebAuthn passkey (`@better-auth/passkey`) as the one-tap server re-auth, and a client-only PIN lock (PBKDF2 hash in localStorage) as an offline UI gate. The dead `console.log` magic-link sender is replaced with a Resend REST call (via `fetch`, no SDK) that also powers first-login and recovery.

**Tech Stack:** Better Auth 1.6.18 (Kysely + kysely-d1), `@better-auth/passkey` (new dep, SimpleWebAuthn under the hood), Cloudflare Workers/D1 via OpenNext, Next 16 + React 19 + Tailwind 4, WebCrypto (PBKDF2), Resend REST API, Vitest + fast-check.

## Global Constraints

- Stack unchanged; presentation follows the shipped glassmorphism system (`glass`/`glass-soft` utilities, `--accent-2` cyan, mono figures via `font-mono`, lucide icons, `<AuroraBackground/>`).
- **Only ONE new dependency:** `@better-auth/passkey`. Resend is called with `fetch` — no SDK. No other deps.
- **New Workers env:** secret `RESEND_API_KEY` (optional-in-schema — its absence must NOT break passkey sign-in); non-secret var `EMAIL_FROM` (a verified Resend sender). Both read from `getCloudflareContext().env`, same pattern as `BETTER_AUTH_SECRET`.
- **No changes** to `/api/*` sync, the sync engine, Groq agents, crons, Dexie domain stores, or the op-log.
- **PIN is a UI lock, not at-rest encryption.** Store only a PBKDF2 hash + salt + iteration count on-device; the PIN never touches the network.
- Session: `expiresIn: 60*60*24*365`, `updateAge: 60*60*24`. Session cookie stays HttpOnly + Secure + SameSite=Lax.
- WebAuthn rpID = the hostname of `BETTER_AUTH_URL` (`pulse.sdsheikahamed.workers.dev`); origin = `BETTER_AUTH_URL`.
- Migrations applied to remote D1 **by hand** (`wrangler d1 execute pulse --remote`) — CI token lacks D1:Edit; CI's D1 steps stay `continue-on-error`.
- **Every task's gate:** `pnpm typecheck` (0) + `pnpm lint` (0) + `pnpm test` (starts at 454, grows, all green) + **`pnpm build` (next build — MANDATORY)**. New pure logic gets unit tests; React components are verified by build + the manual-QA checklist (no DOM/render test env).
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>` on every commit (set with `git -c user.name=... -c user.email=...` if unsure).
- Branch: `feature/auth-passkey-pin` (already created; spec committed at `7c7898e`).

---

### Task 1: Durable session + real magic-link email (Resend)

**Files:**
- Create: `src/lib/email.ts`
- Create: `tests/lib/email.test.ts`
- Modify: `src/lib/auth.ts` (add session config; add `RESEND_API_KEY`/`EMAIL_FROM` to `AuthEnvSchema` as optional + to `AuthEnvBindings`; replace `sendMagicLink` body)
- Modify: `src/lib/env.ts` (add the two optional vars to `EnvSchema` + lazy getters)

**Interfaces:**
- Produces: `buildMagicLinkEmail(url: string): { subject: string; html: string; text: string }`; `sendMagicLinkEmail(opts: { apiKey: string; from: string; to: string; url: string; fetchImpl?: typeof fetch }): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `tests/lib/email.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildMagicLinkEmail, sendMagicLinkEmail } from '@/lib/email'

describe('buildMagicLinkEmail', () => {
  it('embeds the url in both html and text and sets a subject', () => {
    const url = 'https://pulse.sdsheikahamed.workers.dev/api/auth/magic-link/verify?token=abc'
    const { subject, html, text } = buildMagicLinkEmail(url)
    expect(subject.length).toBeGreaterThan(0)
    expect(html).toContain(url)
    expect(text).toContain(url)
  })
})

describe('sendMagicLinkEmail', () => {
  it('POSTs to Resend with bearer auth and the from/to/subject payload', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    await sendMagicLinkEmail({ apiKey: 'k', from: 'Pulse <a@b.co>', to: 'u@x.co', url: 'https://x/y', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [u, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(u).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ from: 'Pulse <a@b.co>', to: 'u@x.co' })
    expect(body.subject).toBeTruthy()
  })

  it('throws on a non-2xx Resend response', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 422 })) as unknown as typeof fetch
    await expect(sendMagicLinkEmail({ apiKey: 'k', from: 'a', to: 'b', url: 'c', fetchImpl }))
      .rejects.toThrow(/Resend send failed: 422/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- email` → FAIL (`@/lib/email` not found).

- [ ] **Step 3: Implement `src/lib/email.ts`**

```ts
export interface MagicLinkEmail {
  subject: string
  html: string
  text: string
}

export function buildMagicLinkEmail(url: string): MagicLinkEmail {
  const subject = 'Your Pulse sign-in link'
  const text = `Sign in to Pulse:\n${url}\n\nThis link expires shortly. If you didn't request it, ignore this email.`
  const html = `<!doctype html><html><body style="margin:0;background:#0a0b16;color:#e9ecf7;font-family:system-ui,-apple-system,sans-serif;padding:32px">
  <h1 style="font-size:20px;margin:0 0 16px">Sign in to Pulse</h1>
  <p style="color:#8a90ab;margin:0 0 24px">Tap the button to sign in. This link expires shortly.</p>
  <a href="${url}" style="display:inline-block;background:linear-gradient(150deg,#6f7bff,#34e6ff);color:#0a0b16;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:12px">Sign in to Pulse</a>
  <p style="color:#8a90ab;font-size:12px;margin:24px 0 0">If you didn't request this, you can ignore this email.</p>
  </body></html>`
  return { subject, html, text }
}

export async function sendMagicLinkEmail(opts: {
  apiKey: string
  from: string
  to: string
  url: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const f = opts.fetchImpl ?? fetch
  const { subject, html, text } = buildMagicLinkEmail(opts.url)
  const res = await f('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: opts.from, to: opts.to, subject, html, text }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend send failed: ${res.status} ${detail}`)
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- email` → PASS (3 tests).

- [ ] **Step 5: Wire session config + Resend into `src/lib/auth.ts`**

Extend `AuthEnvSchema` (keep the existing two required fields; add two optional):

```ts
const AuthEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be ≥ 32 chars'),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
})
```

Extend `AuthEnvBindings`:

```ts
type AuthEnvBindings = {
  DB: D1Database
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
}
```

Add `import { sendMagicLinkEmail } from '@/lib/email'` at the top. Inside `betterAuth({...})`, add a `session` block (place it next to the existing `advanced` block):

```ts
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 1 year — durable across daily PWA opens
      updateAge: 60 * 60 * 24,       // sliding refresh once per day
    },
```

Replace the `magicLink({ ... })` plugin body's `sendMagicLink`:

```ts
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const apiKey = parsed.data.RESEND_API_KEY
          const from = parsed.data.EMAIL_FROM
          if (!apiKey || !from) {
            // Email not configured (e.g. local dev) — log so the flow still works.
            console.log(`[magic-link] email not configured; link for ${email}: ${url}`)
            return
          }
          await sendMagicLinkEmail({ apiKey, from, to: email, url })
        },
      }),
```

- [ ] **Step 6: Mirror the optional vars in `src/lib/env.ts`**

Add to `EnvSchema`: `RESEND_API_KEY: z.string().min(1).optional(),` and `EMAIL_FROM: z.string().min(1).optional(),`. Add matching lazy getters to the exported `env` object:

```ts
  get RESEND_API_KEY() { return loadEnv().RESEND_API_KEY },
  get EMAIL_FROM() { return loadEnv().EMAIL_FROM },
```

- [ ] **Step 7: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all green (test count 454 + 3 = 457).

- [ ] **Step 8: Record the manual ops steps** (do NOT block the commit; note in the task report for the human to run once):

```bash
# One-time, from a logged-in machine:
pnpm exec wrangler secret put RESEND_API_KEY        # paste the Resend API key
# Add to wrangler.toml [vars]:  EMAIL_FROM = "Pulse <onboarding@resend.dev>"   # or a verified sender
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/email.ts tests/lib/email.test.ts src/lib/auth.ts src/lib/env.ts
git commit -m "feat(auth): durable 1y session + real magic-link email via Resend"
```

---

### Task 2: Passkey server plugin + D1 table + runtime smoke test

**Files:**
- Modify: `package.json` + `pnpm-lock.yaml` (add `@better-auth/passkey`)
- Modify: `src/lib/auth.ts` (add the `passkey()` plugin)
- Create: `migrations/0005_passkey.sql`
- Create: `tests/lib/auth-passkey.test.ts`

**Interfaces:**
- Produces: the `passkey` plugin registered on the server auth instance (enables `/api/auth/passkey/*` routes) and the `passkey` D1 table.

**⚠️ This is the primary-risk task (SimpleWebAuthn on workerd). If Step 6 or the `wrangler dev` boot fails because the plugin cannot run server-side on the Workers runtime, STOP and report BLOCKED with the error — do not work around it. The spec's fallback is the in-core `email-otp` plugin; that decision is the human's.**

- [ ] **Step 1: Install the plugin**

Run: `pnpm add @better-auth/passkey` → updates `package.json` + `pnpm-lock.yaml`.

- [ ] **Step 2: Add the plugin to `src/lib/auth.ts`**

Add import: `import { passkey } from '@better-auth/passkey'`. Add to the `plugins` array (after `magicLink(...)`):

```ts
      passkey({
        rpID: new URL(parsed.data.BETTER_AUTH_URL).hostname, // pulse.sdsheikahamed.workers.dev
        rpName: 'Pulse',
        origin: parsed.data.BETTER_AUTH_URL,
      }),
```

- [ ] **Step 3: Generate the exact table schema and create `migrations/0005_passkey.sql`**

Run Better Auth's schema generator to get the exact columns for this config, then port them into the migration:

Run: `npx @better-auth/cli@latest generate --config src/lib/auth.ts --output -` (inspect the emitted `passkey` DDL).

Create `migrations/0005_passkey.sql` matching the generator output. Expected shape (Better Auth's default passkey schema for SQLite — reconcile column names/casing with the generator output, which is authoritative):

```sql
-- Better Auth passkey plugin (@better-auth/passkey). Column names match the
-- plugin's default model fields so NO field mapping is needed in auth.ts.
CREATE TABLE IF NOT EXISTS passkey (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  createdAt INTEGER,
  aaguid TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_credential ON passkey(credentialID);
```

> Note: unlike the core tables, these columns are camelCase to match the plugin's default field names verbatim — this avoids a fragile field-mapping config. If the generator emits different names/types, use the generator's output and adjust this file to match.

- [ ] **Step 4: Apply the migration to local + remote D1**

```bash
pnpm exec wrangler d1 execute pulse --local  --file=migrations/0005_passkey.sql
pnpm exec wrangler d1 execute pulse --remote --file=migrations/0005_passkey.sql
```
Expected: both report the statements executed. (If `--remote` fails on auth, note it in the report for the human — the local apply + build still validate the code.)

- [ ] **Step 5: Write the instantiation test** — `tests/lib/auth-passkey.test.ts`

This proves the plugin loads and registers under Node (a necessary condition for workerd) without needing a browser ceremony. Mock the Cloudflare context + DB.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      DB: {} as unknown,
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://pulse.sdsheikahamed.workers.dev',
    },
  }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => ({}) }))

describe('auth with passkey plugin', () => {
  beforeEach(() => vi.resetModules())

  it('instantiates and exposes passkey generate-options endpoints', async () => {
    const { handler } = await import('@/lib/auth')
    // A GET to a passkey route should be handled (not 404) by the plugin.
    const res = await handler(new Request(
      'https://pulse.sdsheikahamed.workers.dev/api/auth/passkey/generate-register-options',
    ))
    expect(res.status).not.toBe(404)
  })
})
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test -- auth-passkey` → PASS. If it fails with a module/runtime error from `@simplewebauthn` (e.g. a Node-builtin not available), that is the runtime-compat signal → **BLOCKED** (see the ⚠️ note).

- [ ] **Step 7: Boot check + full gate**

Run: `pnpm build` → compiles. Then a manual boot smoke test: `pnpm exec wrangler dev` boots without a startup error mentioning the passkey plugin (record the result in the report; stop `wrangler dev` after). Then `pnpm typecheck && pnpm lint && pnpm test` → green (count 457 + 1 = 458).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/auth.ts migrations/0005_passkey.sql tests/lib/auth-passkey.test.ts
git commit -m "feat(auth): passkey server plugin + passkey D1 table (0005)"
```

---

### Task 3: Passkey client + Settings→Security (register/list/delete) + Security link

**Files:**
- Modify: `src/lib/auth-client.ts` (add `passkeyClient()`)
- Create: `src/app/settings/security/page.tsx`
- Modify: `src/app/settings/page.tsx` (add a "Security" card link)

**Interfaces:**
- Consumes: server passkey routes from Task 2.
- Produces: `authClient.passkey.addPasskey/listUserPasskeys/deletePasskey`, `authClient.signIn.passkey` (used by Task 4).

- [ ] **Step 1: Add the client plugin** — `src/lib/auth-client.ts`

```ts
import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), passkeyClient()],
})
```

- [ ] **Step 2: Create the Security page** — `src/app/settings/security/page.tsx`

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Fingerprint, Trash2, Plus } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'

interface PasskeyRow { id: string; name?: string | null; createdAt?: string | number | null }

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const res = await authClient.passkey.listUserPasskeys()
    if (!res.error && res.data) setPasskeys(res.data as unknown as PasskeyRow[])
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function addPasskey() {
    setBusy(true); setError('')
    try {
      const res = await authClient.passkey.addPasskey({ name: 'This device' })
      if (res?.error) setError(res.error.message ?? 'Could not add passkey.')
      await refresh()
    } catch {
      setError('Passkey registration was cancelled or is unsupported on this device.')
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setError('')
    try {
      await authClient.passkey.deletePasskey({ id })
      await refresh()
    } finally { setBusy(false) }
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Security</h1>

        <section className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <Fingerprint className="size-5 text-accent-2" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Passkeys</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Add this device&apos;s Face ID / fingerprint for one-tap sign-in.
          </p>
          <ul className="mb-3 flex flex-col gap-2">
            {passkeys.length === 0 && (
              <li className="text-sm text-muted-foreground">No passkeys yet.</li>
            )}
            {passkeys.map(pk => (
              <li key={pk.id} className="glass-soft flex items-center justify-between rounded-lg px-3 py-2">
                <span className="text-sm">{pk.name || 'Passkey'}</span>
                <button
                  type="button"
                  onClick={() => remove(pk.id)}
                  disabled={busy}
                  aria-label="Remove passkey"
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button onClick={addPasskey} disabled={busy} className="w-full">
            <Plus className="size-4" aria-hidden /> {busy ? 'Working…' : 'Add passkey'}
          </Button>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </section>

        {/* PIN section is added in Task 5. */}

        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">← Back to Settings</Link>
      </main>
    </>
  )
}
```

- [ ] **Step 3: Add the Security card to `src/app/settings/page.tsx`**

Insert this `<Link>` block immediately before the `<Link href="/settings/preferences">` block:

```tsx
        <Link href="/settings/security">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Passkeys (Face ID sign-in) and app PIN lock.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
```

- [ ] **Step 4: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all green (count stays 458; no new unit tests — UI verified by build + manual QA).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-client.ts src/app/settings/security/page.tsx src/app/settings/page.tsx
git commit -m "feat(auth): passkey client + Settings Security page (add/list/remove)"
```

---

### Task 4: Login page — "Sign in with Face ID"

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `authClient.signIn.passkey` (Task 3).

- [ ] **Step 1: Add the passkey sign-in path to `src/app/login/page.tsx`**

Add a `handlePasskey` handler and a primary button above the email form; demote the email form to a secondary control. Full file:

```tsx
'use client'

import { useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AuroraBackground } from '@/components/aurora-background'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showEmail, setShowEmail] = useState(false)

  async function handlePasskey() {
    setState('sending'); setErrorMsg('')
    try {
      const res = await authClient.signIn.passkey()
      if (res?.error) {
        setErrorMsg('No passkey found on this device. Use email to sign in, then add a passkey in Settings → Security.')
        setState('error')
        return
      }
      window.location.href = '/app'
    } catch {
      setErrorMsg('Passkey sign-in was cancelled or is unsupported here. Try email instead.')
      setState('error')
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setState('sending'); setErrorMsg('')
    try {
      await authClient.signIn.magicLink({ email, callbackURL: '/app' })
      setState('sent')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sign in to Pulse</CardTitle>
          </CardHeader>
          <CardContent>
            {state === 'sent' ? (
              <p className="text-sm text-muted-foreground">Magic link sent. Check your inbox.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Button onClick={handlePasskey} disabled={state === 'sending'} className="w-full">
                  <Fingerprint className="size-4" aria-hidden />
                  {state === 'sending' ? 'Signing in…' : 'Sign in with Face ID'}
                </Button>

                {!showEmail ? (
                  <button
                    type="button"
                    onClick={() => setShowEmail(true)}
                    className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                  >
                    Email me a link instead
                  </button>
                ) : (
                  <form onSubmit={handleEmail} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" required value={email}
                        onChange={e => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <Button type="submit" variant="secondary" disabled={state === 'sending'}>
                      {state === 'sending' ? 'Sending…' : 'Send magic link'}
                    </Button>
                  </form>
                )}

                {errorMsg && <p role="alert" className="text-sm text-destructive">{errorMsg}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

- [ ] **Step 2: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all green (count 458).

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): passkey-first login with email fallback"
```

---

### Task 5: PIN-lock core library (pure, fully tested)

**Files:**
- Create: `src/lib/pin-lock.ts`
- Create: `tests/lib/pin-lock.test.ts`

**Interfaces:**
- Produces: `setPin`, `verifyPin`, `isPinSet`, `clearPin` (all take an optional `PinStore`), and the pure `shouldRelock(lastActiveAt: number | null, now: number, timeoutMs?: number): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/lib/pin-lock.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { setPin, verifyPin, isPinSet, clearPin, shouldRelock, type PinStore } from '@/lib/pin-lock'

function memStore(): PinStore {
  const m = new Map<string, string>()
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) },
  }
}

describe('pin-lock', () => {
  it('verifies the correct pin and rejects a wrong one', async () => {
    const s = memStore()
    await setPin('1234', s)
    expect(isPinSet(s)).toBe(true)
    expect(await verifyPin('1234', s)).toBe(true)
    expect(await verifyPin('0000', s)).toBe(false)
  })

  it('clearPin removes the stored credential', async () => {
    const s = memStore()
    await setPin('4321', s)
    clearPin(s)
    expect(isPinSet(s)).toBe(false)
    expect(await verifyPin('4321', s)).toBe(false)
  })

  it('uses a unique salt per setPin (same pin → different stored hash)', async () => {
    const a = memStore(); const b = memStore()
    await setPin('1111', a); await setPin('1111', b)
    expect(a.getItem('pulse.pin')).not.toBe(b.getItem('pulse.pin'))
  })

  it('round-trips arbitrary pins', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 32 }), async pin => {
      const s = memStore()
      await setPin(pin, s)
      expect(await verifyPin(pin, s)).toBe(true)
    }), { numRuns: 25 })
  })

  it('shouldRelock: locked when never active, or when idle beyond the timeout', () => {
    expect(shouldRelock(null, 1000)).toBe(true)
    expect(shouldRelock(1000, 1000 + 60_000)).toBe(false)      // within 5-min default
    expect(shouldRelock(1000, 1000 + 6 * 60_000)).toBe(true)   // beyond 5 min
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- pin-lock` → FAIL (`@/lib/pin-lock` not found).

- [ ] **Step 3: Implement `src/lib/pin-lock.ts`**

```ts
const STORAGE_KEY = 'pulse.pin'
const ITERATIONS = 210_000
const RELOCK_MS = 5 * 60_000

export interface PinStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface StoredPin { salt: string; hash: string; iterations: number }

function store(s?: PinStore): PinStore {
  return s ?? (globalThis.localStorage as unknown as PinStore)
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return toB64(bits)
}

// Constant-time-ish string compare to avoid leaking match length via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function setPin(pin: string, s?: PinStore): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITERATIONS)
  const rec: StoredPin = { salt: toB64(salt.buffer), hash, iterations: ITERATIONS }
  store(s).setItem(STORAGE_KEY, JSON.stringify(rec))
}

export function isPinSet(s?: PinStore): boolean {
  return store(s).getItem(STORAGE_KEY) !== null
}

export async function verifyPin(pin: string, s?: PinStore): Promise<boolean> {
  const raw = store(s).getItem(STORAGE_KEY)
  if (!raw) return false
  const rec = JSON.parse(raw) as StoredPin
  const hash = await derive(pin, fromB64(rec.salt), rec.iterations)
  return safeEqual(hash, rec.hash)
}

export function clearPin(s?: PinStore): void {
  store(s).removeItem(STORAGE_KEY)
}

// Pure lock-timeout policy. Locked if never unlocked, or idle past the timeout.
export function shouldRelock(lastActiveAt: number | null, now: number, timeoutMs = RELOCK_MS): boolean {
  if (lastActiveAt === null) return true
  return now - lastActiveAt > timeoutMs
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- pin-lock` → PASS (5 tests).

- [ ] **Step 5: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all green (count 458 + 5 = 463).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pin-lock.ts tests/lib/pin-lock.test.ts
git commit -m "feat(auth): PIN-lock core lib (PBKDF2 hash + relock policy)"
```

---

### Task 6: Lock screen + gate + PIN management + polish + full QA

**Files:**
- Create: `src/components/lock-screen.tsx`
- Create: `src/components/lock-gate.tsx`
- Modify: `src/app/app/page.tsx` (wrap the authenticated render in `<LockGate>`)
- Modify: `src/app/settings/security/page.tsx` (add the PIN management section)

**Interfaces:**
- Consumes: `src/lib/pin-lock.ts` (Task 5).

- [ ] **Step 1: Create the lock screen** — `src/components/lock-screen.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { verifyPin } from '@/lib/pin-lock'
import { AuroraBackground } from '@/components/aurora-background'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const ok = await verifyPin(pin)
    setBusy(false)
    if (ok) { onUnlock(); return }
    setError('Incorrect PIN.')
    setPin('')
  }

  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-screen items-center justify-center p-4">
        <form onSubmit={submit} className="glass flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl p-6">
          <Lock className="size-8 text-accent-2" aria-hidden />
          <h1 className="text-lg font-semibold">Enter your PIN</h1>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value)}
            aria-label="PIN"
            className="glass-soft w-full rounded-lg px-3 py-2 text-center font-mono text-2xl tracking-[0.4em] outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
          />
          <button
            type="submit"
            disabled={busy || pin.length === 0}
            className="w-full rounded-lg bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] px-4 py-2 font-medium text-background disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </main>
    </>
  )
}
```

- [ ] **Step 2: Create the lock gate** — `src/components/lock-gate.tsx`

```tsx
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isPinSet, shouldRelock } from '@/lib/pin-lock'
import { LockScreen } from '@/components/lock-screen'

export function LockGate({ children }: { children: ReactNode }) {
  // Locked on cold start iff a PIN is configured on this device.
  const [locked, setLocked] = useState(() => (typeof window !== 'undefined' ? isPinSet() : false))
  const lastActive = useRef<number>(Date.now())

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (isPinSet() && shouldRelock(lastActive.current, Date.now())) setLocked(true)
      } else {
        lastActive.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (locked) {
    return <LockScreen onUnlock={() => { lastActive.current = Date.now(); setLocked(false) }} />
  }
  return <>{children}</>
}
```

- [ ] **Step 3: Wrap the `/app` render** — `src/app/app/page.tsx`

Add `import { LockGate } from '@/components/lock-gate'` to the imports. Find the default export (which renders `<AppPageInner />` inside `<Suspense>`) and wrap `<AppPageInner />` with `<LockGate>`:

```tsx
// e.g. the default export becomes:
export default function AppPage() {
  return (
    <Suspense>
      <LockGate>
        <AppPageInner />
      </LockGate>
    </Suspense>
  )
}
```

> The PIN gate sits outside `AppPageInner`, so while locked the app's session check and queue-drain effects do not run — correct: a locked device reveals nothing and touches no data. After unlock, `AppPageInner` mounts and its existing `getSession()` redirect handles the no-session case.

- [ ] **Step 4: Add PIN management to `src/app/settings/security/page.tsx`**

Add these imports: `import { useState as usePinState } from 'react'` is unnecessary — reuse `useState`. Add `import { setPin as savePin, clearPin, isPinSet, verifyPin } from '@/lib/pin-lock'`. Inside `SecurityPage`, add state + handlers and render a PIN `<section>` where the `{/* PIN section is added in Task 5. */}` comment sits:

```tsx
  const [hasPin, setHasPin] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pinMsg, setPinMsg] = useState('')

  useEffect(() => { setHasPin(isPinSet()) }, [])

  async function saveNewPin() {
    setPinMsg('')
    if (hasPin && !(await verifyPin(current))) { setPinMsg('Current PIN is incorrect.'); return }
    if (next.length < 4) { setPinMsg('Use at least 4 digits.'); return }
    await savePin(next)
    setHasPin(true); setCurrent(''); setNext(''); setPinMsg('PIN saved.')
  }

  async function removePin() {
    setPinMsg('')
    if (hasPin && !(await verifyPin(current))) { setPinMsg('Current PIN is incorrect.'); return }
    clearPin(); setHasPin(false); setCurrent(''); setNext(''); setPinMsg('PIN removed.')
  }
```

```tsx
        <section className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="size-5 text-accent-2" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">App PIN</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            {hasPin ? 'A PIN unlocks the app on each open.' : 'Set a PIN to lock the app on each open.'}
          </p>
          <div className="flex flex-col gap-2">
            {hasPin && (
              <input type="password" inputMode="numeric" placeholder="Current PIN" value={current}
                onChange={e => setCurrent(e.target.value)} aria-label="Current PIN"
                className="glass-soft rounded-lg px-3 py-2 font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent-2" />
            )}
            <input type="password" inputMode="numeric" placeholder={hasPin ? 'New PIN' : 'New PIN (4+ digits)'} value={next}
              onChange={e => setNext(e.target.value)} aria-label="New PIN"
              className="glass-soft rounded-lg px-3 py-2 font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent-2" />
            <div className="flex gap-2">
              <Button onClick={saveNewPin} disabled={busy} className="flex-1">{hasPin ? 'Change PIN' : 'Set PIN'}</Button>
              {hasPin && <Button variant="secondary" onClick={removePin} disabled={busy}>Turn off</Button>}
            </div>
            {pinMsg && <p role="alert" className="text-sm text-muted-foreground">{pinMsg}</p>}
          </div>
        </section>
```

Add `Lock` to the lucide import line: `import { Fingerprint, Trash2, Plus, Lock } from 'lucide-react'`.

- [ ] **Step 5: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all green (count 463).

- [ ] **Step 6: Accessibility + contrast pass** (lock screen + security page): confirm every interactive element has `focus-visible:ring-2 ring-accent-2`, the lock screen honors reduced motion (aurora already motion-safe), PIN inputs are `type="password"` + `inputMode="numeric"`, touch targets ≥44px on mobile.

- [ ] **Step 7: Manual QA runbook** (record results in the task report):
  1. Configure `RESEND_API_KEY` + `EMAIL_FROM` (Task 1 Step 8), deploy or `wrangler dev`.
  2. `/login` → "Email me a link instead" → receive email → sign in → lands on `/app`.
  3. Settings → Security → "Add passkey" → complete Face ID registration.
  4. Set a PIN.
  5. Kill + reopen the PWA → **PIN screen** appears → unlock.
  6. Sign out / clear cookies → `/login` → "Sign in with Face ID" → one tap → `/app`.
  7. Settings → Security → remove passkey / turn off PIN both work.

- [ ] **Step 8: Commit**

```bash
git add src/components/lock-screen.tsx src/components/lock-gate.tsx src/app/app/page.tsx src/app/settings/security/page.tsx
git commit -m "feat(auth): PIN lock screen + gate + PIN management in Settings"
```

---

## Self-Review

**Spec coverage:**
- Durable session (1y sliding) → Task 1. ✓
- Real email via Resend (fetch, no SDK) → Task 1. ✓
- Passkey server plugin + `passkey` table + runtime risk smoke test + `email-otp` fallback escalation → Task 2. ✓
- Passkey client + register/list/delete + Security page + Security link → Task 3. ✓
- Passkey-first login with email fallback → Task 4. ✓
- PIN core (PBKDF2 hash, verify, relock policy) → Task 5. ✓
- Lock screen + gate (cold-start + idle relock, offline) + PIN management + a11y + manual QA → Task 6. ✓
- Only new dep `@better-auth/passkey` → Task 2 (Resend uses fetch). ✓
- Migrations applied by hand to remote D1 → Task 2 Step 4. ✓
- `pnpm build` in every gate → all tasks. ✓
- Git identity → Global Constraints. ✓
- Honest limit (PIN ≠ at-rest encryption) → carried from spec Non-goals; not a task. ✓

**Placeholder scan:** No TBD/TODO. The only soft spot is Task 2 Step 3's DDL, which is deliberately reconciled against `@better-auth/cli generate` output (the authoritative source) with a concrete reference DDL provided — not a placeholder.

**Type consistency:** `PinStore` shape identical across `pin-lock.ts` and its test; `setPin/verifyPin/isPinSet/clearPin/shouldRelock` signatures match between Task 5 definition and Task 6 usage (`setPin` aliased to `savePin` on import in Task 6 to avoid colliding with the local `setPin` state setter — intentional, noted). `buildMagicLinkEmail`/`sendMagicLinkEmail` signatures match between Task 1 definition and `auth.ts` usage. `authClient.passkey.*` / `authClient.signIn.passkey` method names match the verified Better Auth API. `LockGate`/`LockScreen` props match between definition and usage.
