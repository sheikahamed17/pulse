<div align="center">

# Pulse

**A local-first personal life-OS — money, tasks, learning, and notes in one place, captured by voice or plain language and synced across your devices.**

Ask *"how much did I spend on food this month?"* out loud and hear the answer. Snap a thought before it's gone. Get a weekly AI digest of your own life. All of it runs on your own free-tier cloud, offline-first, installable as an app.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%C2%B7%20D1%20%C2%B7%20R2-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)](#install-it)
[![Tests](https://img.shields.io/badge/tests-passing-3FB950)](#testing)

[**Run your own copy →**](./SELF-HOSTING.md)

</div>

---

## Why Pulse

Most life-trackers make you fill in forms. Pulse flips it: you **say or type one line** — *"lunch 240"*, *"finish the deck by friday"*, *"idea: batch the FX cron"* — and the AI files it in the right place. Your data lives **in your browser first** (so it's instant and works offline) and syncs to a database **you own**. There's no shared backend, no ads, no data mining — one instance per person, running on free tiers that comfortably fit a single user.

## Highlights

- 🎙️ **Voice & natural-language capture** — one field for everything; the AI routes it to the right domain and fills the fields.
- 💬 **Ask your data** — read-only natural-language questions across all four domains (*"total spend last week"*, *"what's overdue?"*), answered by voice or text.
- 📴 **Local-first & offline** — every entry is written to on-device storage first, then synced. No spinner waiting on the network.
- 🔐 **Passkey (Face ID) sign-in** — plus a local PIN lock and a durable session; magic-link fallback.
- 📈 **Weekly AI digests** — a browsable history of auto-generated summaries of your week.
- 🏦 **Bank-transaction auto-import** — forward your bank's alert emails and they land as categorized entries, hands-free.
- 📊 **Spending trends** — a dedicated analytics view: spend / income / net over time, top movers, and per-category small multiples.
- 📲 **Installable PWA** — add to home screen; push notifications for budget alerts and follow-ups.

## Features

### The four domains
| Domain | What it captures |
|---|---|
| 💸 **Money** | Expenses & income, multi-currency with daily FX, per-category **budgets** with progress bars and 80% / 100% push alerts. |
| ✅ **Tasks** | To-dos with due dates, recurring tasks, projects, tags, and sub-tasks. |
| 📚 **Learning** | What you learned each day — a searchable running log. |
| 📝 **Notes** | Voice quick-capture: verbatim body, AI-generated title & tags, free-text search. |

### Intelligence
- **Router → domain agents.** A small model classifies your input into one of ~10 intents; a per-domain agent extracts structured fields.
- **Query agents ("ask your data").** Questions become a *plan* the client executes locally over your own data — the AI never sees your entries, only the shape of the question. Supports totals, breakdowns, period-over-period deltas, and time series for money, plus lookups for tasks, learning, and notes.
- **Voice answers.** Voice question → transcription → route → plan → answer card, with a concise spoken summary read back to you.
- **Insights.** Weekly digests generated on a schedule and browsable at `/insights`, with on-demand refresh for the current week.

### Capture & auto-import
- **Manual add** on any tab, with back-dating for money entries.
- **Categorize-on-ingest.** Auto-imported transactions arrive with a one-tap category picker and a push notification.
- **Email auto-ingest.** A Gmail filter + a tiny Google Apps Script forwards bank alerts to your instance — the only truly hands-off path on iOS.

### Organize & analyze
- **Category management.** Rename, set icons, archive/restore, and **merge duplicates** (reassigning their entries) in Settings → Categories.
- **Filter, sort & timestamps.** Every list filters and sorts (money by category / source / direction / date range, or by amount); every entry shows when it's from.
- **Analytics** (`/analytics`). Spend trend, income vs spend + net, top movers, and per-category small multiples over the last weeks/months — inline SVG on a colorblind-validated palette.

## How it works

```
                    ┌─────────────────────────── your device ───────────────────────────┐
  voice / text ──▶  │  Router (Groq)  ──▶  domain agent  ──▶  op written to Dexie (local) │
                    │                                                    │                │
                    │            UI reads Dexie live (offline-first)     │  op-log sync   │
                    └────────────────────────────────────────────────────┼───────────────┘
                                                                          ▼
                                          Cloudflare Worker  ──▶  D1 (op-log + projections) · R2 (files)
```

- **Local-first storage.** The UI reads and writes **Dexie** (IndexedDB) directly, so it's instant and fully functional offline.
- **Sync = an op-log with per-field HLC last-writer-wins.** Every change is an append-only operation stamped with a hybrid logical clock. Sync is incremental (bounded per request), so it scales as history grows and converges deterministically across devices — no "who won?" ambiguity.
- **The op-log is the source of truth.** Server tables are projections materialized from the log; they can be rebuilt at any time.
- **AI stays privacy-preserving for queries.** Query agents return a *plan*, not an answer — your entries never leave the device to be "read" by the model.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) · **React 19** · **Tailwind CSS 4** |
| Client data | **Dexie** (IndexedDB) · offline-first |
| Server data | **Cloudflare D1** (SQLite) + **R2** (files) via **Kysely** |
| Runtime | **OpenNext** on **Cloudflare Workers** · **Serwist** service worker |
| Auth | **Better Auth** — magic link + passkeys (WebAuthn) |
| AI | **Groq** (`gpt-oss`) for the router, domain agents, and Whisper transcription |
| UI | Geist font · lucide icons · dark glassmorphism |
| Tests | **Vitest** · `fake-indexeddb` · `fast-check` |

## Getting started

Pulse is **single-user by design** — you deploy your **own** copy (your data, your API keys, your free-tier quota, fully isolated). Everything you need has a free tier.

**Two ways to stand up your own instance:**

- **A · Let Claude Code do it.** Open this repo in [Claude Code](https://claude.com/claude-code) and ask it to *"set up this project for me."* It reads [`CLAUDE.md`](./CLAUDE.md) — the project's instructions for AI agents — and walks you through creating your Cloudflare / Groq / Resend resources, applying migrations, setting secrets, and deploying.
- **B · Do it by hand.** Follow **[SELF-HOSTING.md](./SELF-HOSTING.md)**: clone → create D1 + R2 → apply migrations → set secrets → `wrangler deploy`. ~20 minutes.

Either way you sign in with your **Resend-account email** (the free sandbox sender only mails you) — no custom domain needed.

### Install it

Once deployed, open your instance on your phone and **Add to Home Screen** to install the PWA, then add a passkey (Settings → Security) for Face ID / one-tap sign-in.

## Local development

```bash
pnpm install
pnpm dev          # http://localhost:3000  (magic-link prints to the console when email is unconfigured)
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm cf:build     # Next + OpenNext build for Cloudflare
pnpm cf:preview   # build + run the Worker locally
```

> Requires **Node 22** and **pnpm**. See [SELF-HOSTING.md](./SELF-HOSTING.md) for the full deploy path.

## Project structure

```
src/
  app/            # Next App Router — routes, API handlers, pages (/app, /analytics, /insights, /settings/*)
  lib/            # sync engine, agents, ingest, auth/email, pure helpers (unit-tested)
  components/     # UI: capture chips, domain lists, answer cards, charts
migrations/       # D1 schema, applied in order 0001 → 0022
scripts/          # icon generation, service-worker build, router eval, VAPID keygen
tests/            # vitest suites (agents, api routes, sync, lib)
docs/superpowers/ # design specs and implementation plans
```

## Testing

```bash
pnpm test            # full suite
pnpm test:watch      # watch mode
pnpm test:coverage   # coverage report
pnpm eval:router     # opt-in router-accuracy eval against a labeled dataset
```

The suite covers the sync engine's convergence invariants, the agent/query pipelines, and the API routes. `tsc --noEmit` runs in CI because Vitest (esbuild) does **not** typecheck.

## Status & license

Pulse is an actively developed **personal project**, deployed to production and used daily. It ships behind a CI + Cloudflare deploy pipeline on every push to `main`.

No formal open-source license is attached yet — if you'd like to reuse the code, please ask. You're welcome to self-host your own copy for personal use.
