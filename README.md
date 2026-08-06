# Pulse

A **local-first personal life-OS** — money, tasks, learning, and notes in one place, captured by voice or natural-language text and synced across your devices. Installable as a PWA; passkey (Face ID) sign-in; weekly AI digests; optional bank-transaction auto-import.

**Stack:** Next.js 16 (App Router) + React 19 + Tailwind 4 · Dexie (client) + Cloudflare D1/R2 (server) via Kysely · Better Auth (magic link + passkeys) · OpenNext on Cloudflare Workers · Serwist service worker · Groq (gpt-oss) for the AI agents. Sync is an op-log with per-field HLC last-writer-wins.

## Run it yourself

Pulse is single-user by design — deploy your **own** copy (your data, your keys, your free-tier quota). See **[SELF-HOSTING.md](./SELF-HOSTING.md)** for the full ~20-minute guide.

## Local development

```bash
pnpm install
pnpm dev          # http://localhost:3000  (magic-link falls back to console.log when email is unconfigured)
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm cf:build     # Next + OpenNext build for Cloudflare
```

Design/spec/plan docs live under `docs/superpowers/`.
