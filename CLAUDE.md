# Pulse — instructions for Claude Code

You are working in **Pulse**, a local-first, **single-user** personal life-OS (money · tasks · learning · notes; voice/natural-language capture; weekly AI digests; analytics). Anyone who clones this repo runs their **own isolated instance** — their Cloudflare account, their API keys, their data. This file tells you how to set that up and how to develop the code correctly.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind 4 · Dexie (IndexedDB, client) · Cloudflare D1 + R2 via Kysely (server) · Better Auth (magic link + passkeys) · OpenNext on Cloudflare Workers · Serwist service worker · Groq (`gpt-oss`) for the AI. Sync is an **op-log with per-field HLC last-writer-wins**.

---

## If the user asks you to set up / deploy their own copy

Walk them through the steps below. **The canonical, always-up-to-date reference is [`SELF-HOSTING.md`](./SELF-HOSTING.md)** — read it and follow it; the outline here is so you know the shape and what only the human can do.

**Only the human can:** create the Cloudflare / Groq / Resend accounts, run `wrangler login` (interactive browser auth), and provide API keys. Ask them to run those and paste results; never invent credentials.

1. **Prereqs** — Node 22 + pnpm; `npm i -g wrangler` then **ask the user to run `wrangler login`**.
2. `pnpm install`.
3. **Create resources:** `wrangler d1 create pulse` → put the printed `database_id` into `wrangler.toml` under `[[d1_databases]]` (this is the ONLY per-instance value in that file). `wrangler r2 bucket create pulse-receipts`.
4. **Migrations:** apply every file in `migrations/` in order (0001 → the highest number) to the remote D1:
   `wrangler d1 execute pulse --remote --file=migrations/0001_initial.sql` … If `--file` returns a `401`, use `--command "<paste the file's SQL>"` instead (a known Wrangler/OAuth quirk).
5. **VAPID keys:** `node scripts/generate-vapid-keys.mjs` → set BOTH keys as secrets in the next step.
6. **Secrets** (via `wrangler secret put <NAME>`): `BETTER_AUTH_SECRET` (≥32 random chars), `BETTER_AUTH_URL` (the instance URL), `GROQ_API_KEY`, `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`. **Secrets are Worker secrets — never write them into the repo.**
7. **Build & deploy:** `pnpm cf:build && wrangler deploy`. Set `BETTER_AUTH_URL` to the printed URL and redeploy if needed.
8. **Sign in with the user's Resend-account email.** On Resend's free tier the sandbox sender `onboarding@resend.dev` only delivers to that address — no custom domain needed for a single user. (A domain is only needed to email *other* people.)
9. **Optional auto-deploy on push:** a GitHub Actions **secret** `CLOUDFLARE_API_TOKEN` (Workers **and** D1 edit scopes) + a **variable** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `.github/workflows/deploy.yml` does the rest.

---

## Architecture (understand before changing code)

- **Local-first.** The UI reads and writes **Dexie** (IndexedDB) directly — instant and fully offline. It never blocks on the network.
- **Sync = op-log + per-field HLC LWW.** Every change is an append-only op stamped with a hybrid logical clock. `/api/sync` is incremental (bounded per request). **The op-log is the source of truth**; server D1 tables are *projections* built by `materializeRow` and can be rebuilt.
- **Agents.** text/voice → a small Groq **router** picks an intent → a per-domain agent extracts structured fields → an op. **Query agents return a PLAN** the client executes locally over Dexie, so your entries are never sent to the model.
- **Auth** is Better Auth (magic link + passkeys). **Deploy** is OpenNext → Cloudflare Workers; a Serwist service worker makes it an installable PWA.

## Development workflow — follow this

- **Gate before every commit and merge:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. **All four must pass.** Do **not** skip `pnpm lint` — the deploy workflow runs Lint *before* `wrangler deploy`, so a lint error fails the deploy.
- Vitest (esbuild) does **not** typecheck — that's why `pnpm typecheck` (`tsc --noEmit`) is a separate, mandatory step. Write pure logic test-first.
- Branch off `main`; `git add` only the files you changed (never `-A`); **never commit secrets**.
- **Merging to `main` auto-deploys** via GitHub Actions (if the user set that up). After merging, verify CI + Deploy are green and the prod URL returns 200.
- Features here are built spec → plan → implement → review; design docs live in `docs/superpowers/`.

## Conventions & gotchas (these bite — internalize them)

- **The op_log is truth.** Server materialized tables can be stale/divergent. To diagnose entity state, reconstruct from `op_log` (per id: latest-HLC op is a delete? → gone; else active). Don't trust the server `money`/`categories` tables directly.
- **Adding a new persisted `entity_kind`** requires BOTH server `src/lib/materialize.ts` AND client `src/lib/sync-client.ts` (`applyLocalOp` + the Dexie transaction list) — the client half is easy to forget; add a test. Adding a new *value* to an existing enum needs neither.
- **Cloudflare caps cron triggers at 5 per Worker.** Never exceed 5; extra scheduled work rides an existing tick (see the `CRON_SECONDARY` map in `worker.ts`).
- **Remote D1 migrations:** prefer `wrangler d1 execute pulse --remote --command "<sql>"`; `--file` can 401 under OAuth.
- **ESLint `react-hooks/purity`:** never call `Date.now()` in a render body or inside `useMemo` — use `new Date().getTime()` (in a `useMemo`/handler), or the deploy's Lint step fails.
- **Charts** are inline SVG (no chart library). Follow the dataviz method: form → **validated** palette → marks → hover → a11y. Categorical color follows the **entity** (hash its name), never its rank; never a dual-axis; series colors must not reuse the categorical hues.
- **Money amounts are minor units** — divide by 100 for display, except **JPY** (whole). Currency conversion goes through `convertViaRates` (fallback to 0 on a missing rate).
- **Category name resolution for display must span ALL categories** (including archived/tombstoned) via `makeCategoryResolver` + `useAllCategories`, and breakdowns merge same-name buckets; category **pickers** use active-only `useCategories`.
- **Client-only (read/display) features need no migration** — only new persisted entity kinds or columns do.

## Where things are

- `src/app/` — App Router routes, API handlers, and pages (`/app`, `/analytics`, `/insights`, `/settings/*`).
- `src/lib/` — sync engine, agents, ingest, auth/email, and pure helpers (unit-tested).
- `src/components/` — UI (capture chips, domain lists, answer cards, `charts/`).
- `migrations/` — D1 schema; apply in numeric order.
- `scripts/` — icon generation, service-worker build, VAPID keygen, router eval.
- `docs/superpowers/` — design specs + implementation plans.
- `wrangler.toml` — Worker config; the only per-instance value is your `database_id`.

## Guardrails — do NOT

- Hardcode secrets or API keys anywhere in the repo — they are Worker secrets (`wrangler secret put`) / GitHub Actions secrets.
- Put anything but your own `database_id` as per-instance config in `wrangler.toml`; keep `EMAIL_FROM` as the Resend sandbox sender unless the user verifies a domain.
- Exceed 5 cron triggers; add a heavy dependency (e.g. a chart library) without a real need.
- Push to `main` without the full gate green, or skip `pnpm lint`.
