# Pulse Auth — Passkey + PIN Lock + Durable Session — Design Spec

**Date:** 2026-07-08
**Status:** Approved direction (user chose passkey + PIN + long session, iPhone/Safari PWA, Resend-wired email bootstrap). Ready for implementation plan.
**Scope:** Replace the magic-link-only, non-durable sign-in with a phone-first, mostly-tap-free auth model. Additive to the existing Better Auth setup; the sync engine, agents, crons, and domain data model are untouched.

## Problem

- The magic-link sender only `console.log`s the link (`src/lib/auth.ts`) — no email is ever delivered, so the user never obtains a durable session and effectively cannot log in on a phone.
- No `session` lifetime is configured, so Better Auth defaults to a 7-day cookie.
- Target device is an **installed iOS Safari PWA**, where re-typing/pasting a long magic-link URL on every open is unacceptable UX.

## Goal

Sign in on the phone in **one biometric tap** (passkey / Face ID), stay signed in across daily opens (durable session), and gate the offline-capable PWA behind a **fast local PIN** so a picked-up phone can't read the user's finances. Real email (Resend) provides the one-time bootstrap and account recovery.

## The three-layer model

Each layer has a distinct job; they do not overlap.

| Layer | Job | Lives | Needs network? |
|---|---|---|---|
| **Durable session** | Keep the user authenticated across daily opens | Better Auth `session` cookie (HttpOnly, ~1y, sliding) | no (cookie already present) |
| **Passkey (WebAuthn)** | Re-establish a session in one biometric tap on first login, after cookie loss, or on a new device | credential in D1 `passkey` table; private key in the phone's secure element | yes |
| **PIN lock** | Fast local gate over the app UI on each cold open / after idle — works offline | PIN **hash** (PBKDF2 via WebCrypto) in Dexie/localStorage; never sent to server | no |
| **Magic link (Resend)** | One-time bootstrap + recovery + adding a new device | existing `verification` table; delivered by real email | yes |

### iOS cookie reality (why this combination)

An HttpOnly cookie set server-side via `Set-Cookie` is **not** subject to ITP's 7-day cap on *script-writable* cookies, and first-party data for a site the user actively opens is not purged. So for a **daily-used** PWA, a long-lived HttpOnly session cookie persists in practice. The passkey is the robust safety net for the "returned after a long gap" / "reinstalled the PWA" / "new device" cases where the cookie is genuinely gone — re-auth is then one Face ID tap, not an email round-trip. The PIN is an independent local privacy gate that also works with no network at all.

## Non-goals

- No change to `/api/*` sync, the sync engine, Groq agents, crons, Dexie domain stores, or the op-log.
- **PIN is an app-lock, not encryption of data at rest.** IndexedDB contents remain unencrypted; full at-rest encryption is a separate, larger feature (explicitly deferred).
- No multi-user, roles, or password auth. Single-user personal app.
- No RFC-8291-style changes to the existing push feature.
- No SMS/OTP-over-SMS. Email (magic link) is the only server-delivered fallback.

## Global constraints

- Stack unchanged: Next 16 + React 19 + Tailwind 4 + Better Auth 1.6.18 (Kysely + kysely-d1) on Cloudflare Workers via OpenNext. Presentation follows the shipped glassmorphism system (glass panels, `--accent-2`, mono figures, lucide icons).
- **New dependencies (flagged):** `@better-auth/passkey` (server) + `@better-auth/passkey/client` (client) — pulls in `@simplewebauthn/*` transitively. **No other new deps.** Resend is called via its REST API with `fetch` (no SDK).
- **New secret:** `RESEND_API_KEY` (Workers secret). Plus a non-secret `EMAIL_FROM` var (verified Resend sender).
- Migrations are applied to remote D1 **by hand** (`wrangler d1 execute pulse --remote`) because the CI token lacks D1:Edit; CI's D1 steps stay `continue-on-error`.
- All existing tests stay green; **`pnpm build` (next build) is mandatory in the gate** (the recorded deploy lesson). New pure logic (PIN hashing, lock-state, email payload builder) gets unit tests; React components are not unit-tested (no DOM/render env) — verified via build + manual QA.
- Git identity `sdsheikahamed@gmail.com`. WCAG AA, visible focus, ≥44px touch targets, `prefers-reduced-motion` honored on the lock screen.
- rpID / origin bound to the deployed host `pulse.sdsheikahamed.workers.dev` (a `*.workers.dev` host is a valid WebAuthn rpID). If a custom domain is added later, rpID must be updated.

## Architecture — files

**Server**
- `src/lib/auth.ts` — add the `passkey({ rpID, rpName, origin })` plugin; add `session: { expiresIn: 60*60*24*365, updateAge: 60*60*24 }`; set `advanced.useSecureCookies` for prod + persistent cookie attributes; replace the `console.log` `sendMagicLink` body with a Resend REST call (`POST https://api.resend.com/emails`, Bearer `RESEND_API_KEY`, `EMAIL_FROM`, a small branded HTML). Read `RESEND_API_KEY`/`EMAIL_FROM` from `getCloudflareContext().env` (same pattern as the existing auth secrets) and validate via the existing Zod env schema.
- `migrations/0005_passkey.sql` — `passkey` table in snake_case matching `0001_initial.sql` style (`IF NOT EXISTS`, integer epoch `created_at`, FK `user_id → user(id) ON DELETE CASCADE`, index on `user_id`, unique on `credential_id`). Field→column mapping added to `auth.ts` (mirroring the existing `user`/`session`/`account`/`verification` mappings) so the adapter emits snake_case SQL.

**Client**
- `src/lib/auth-client.ts` — add `passkeyClient()` to the plugins array (keep `magicLinkClient()`).
- `src/app/login/page.tsx` — primary **"Sign in with Face ID"** button calling `authClient.signIn.passkey({ ... })` with a graceful fallback message when no passkey exists on the device; demote the email flow to a secondary "Email me a link instead" control (now backed by real Resend delivery).
- `src/lib/pin-lock.ts` (new, pure) — `setPin(pin)`, `verifyPin(pin)`, `isPinSet()`, `clearPin()` using PBKDF2 (WebCrypto `subtle.deriveBits`, per-device random salt, high iteration count) storing only `{salt, hash, iterations}`; plus lock-state helpers `lock()`, `isLocked()`, and an idle/relock policy (`shouldRelock(lastActiveAt, now)` with a configurable timeout, e.g. relock on cold start and after N minutes backgrounded).
- `src/components/lock-screen.tsx` (new) — glassmorphism PIN overlay (numeric keypad, `inputMode="numeric"`, mono digits, aurora behind), escalating retry delay after repeated failures, "Use email to reset" escape hatch. Honors reduced-motion.
- Wire the lock screen into the `/app` shell (and settings) so a locked+session-valid state shows the PIN screen before any data renders; a no-session state routes to `/login`.
- **Settings → Security** (`src/app/settings/...`, new subsection or page): "Add passkey (this device)" (`addPasskey`), "Your passkeys" list with rename/delete (`listUserPasskeys`/`updatePasskey`/`deletePasskey`), "Set / change PIN", "Turn off PIN".

## Key flows

1. **First login (bootstrap):** `/login` → "Email me a link" → Resend delivers → open link → session created → app prompts "Set a PIN" and "Add Face ID for one-tap sign-in" (`addPasskey`, which requires the just-created session — `registration.requireSession` default `true`).
2. **Daily open, session valid:** cold start → lock screen → enter PIN → app unlocks. No network needed.
3. **Session gone (long gap / reinstall) :** open → no session → `/login` shows "Sign in with Face ID" → `signIn.passkey()` → session re-established → PIN screen (or set PIN if new install) → in.
4. **New device:** email-link bootstrap on the new device → `addPasskey` there → that device now has its own passkey + PIN.
5. **Recovery (lost passkey device):** email-link sign-in still works from any device; user can delete the lost device's passkey from Settings → Security.
6. **PIN set/change/off:** in Settings → Security; changing/removing PIN requires entering the current PIN (or a fresh session if none set).

## Data & security model

- `passkey` table: `id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, created_at, aaguid`. Private key never leaves the device secure element; only the public key + counter live in D1.
- PIN: only a PBKDF2 hash + salt + iteration count are stored on-device; the PIN never touches the network or the server. Lockout uses an escalating client-side delay (not a hard wipe).
- Session cookie stays HttpOnly + Secure + SameSite=Lax (same-origin app); `expiresIn` sets its Max-Age.
- Resend call failures surface as the existing `role="alert"` login error; the magic-link record is still created server-side (so a failure is a delivery problem, logged, not a silent auth hole).

## Testing & verification

- **Unit (new):** `pin-lock` hashing determinism + verify true/false + salt uniqueness + `shouldRelock` boundaries (fast-check for arbitrary PIN strings/whitespace); the Resend payload builder (correct headers/body, from/subject) with `fetch` mocked; auth session-config assertions.
- **Gate (every task):** `pnpm typecheck` + `pnpm lint` + `pnpm test` (stays green, grows) + **`pnpm build`**.
- **Manual QA (must):** on the iPhone PWA — email bootstrap → add passkey → kill app → reopen (PIN) → sign out / clear cookie → "Sign in with Face ID". Verify focus/contrast on the lock screen and ≥44px keypad targets.

## Risks & mitigations

- **`@better-auth/passkey` / `@simplewebauthn` on the workerd/OpenNext runtime** *(primary risk)* — SimpleWebAuthn ≥ v9 is WebCrypto-based and generally isomorphic, but must be proven on this runtime early. **Mitigation:** the plan's first passkey task is a runtime smoke test (register+authenticate against the deployed Worker or `wrangler dev`); if it cannot run server-side on workerd, fall back to the in-core **`email-otp`** plugin (6-digit code, Workers-safe) as the daily method while keeping PIN + long session — this is a known-good escape hatch that needs no new native deps.
- **rpID binding** — passkeys are bound to `pulse.sdsheikahamed.workers.dev`; a future custom domain invalidates them. Documented; acceptable for now.
- **iOS PWA cookie persistence** — mitigated by design: passkey is the one-tap recovery when the cookie is gone; the app never hard-depends on the cookie surviving.
- **Resend deliverability** — requires a verified sender/domain; until a domain is verified, use Resend's onboarding/testing sender. Flagged as a setup step, not code.
- **Lockout UX** — escalating delay only (no data wipe) to avoid a frustrated user nuking their local-first data.
