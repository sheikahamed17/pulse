# Pulse — Personal AI Life-OS

**Design spec**
**Status:** Draft v1 — awaiting Sheik's review
**Date:** 2026-06-15
**Owner:** Sheik (stains.j@tcs.com)
**Working name:** Pulse (renameable before public launch; not load-bearing for v1)

---

## TL;DR

Pulse is a **local-first PWA** that tracks **money, tasks/projects, and learning** (with notes as substrate), via a **voice-first AI interface** that parses natural-language entries into structured data on the fly. Built as an **open-source portfolio piece on a strict $0-runtime budget**: Cloudflare (Pages + Workers + Cron) + Xata Postgres (with built-in vectors and full-text search) + Groq (Llama 3.x + Whisper). The **IndexedDB store on each device is the source of truth**; an **HLC + op-log + per-field-LWW sync engine** keeps multiple devices consistent. Deeper retrospective reasoning is delegated to Claude Code (Sheik's existing subscription) as a manual side-car, out of the hot path.

The thesis: a frontier-model-architected app running on cost-zero infrastructure can beat market incumbents that charge $10–30/month for what is essentially LLM API calls plus a UI.

---

## Audience

- **Primary user:** Sheik — AI Engineer at TCS on the 20-person RapidBuild team that ships agentic-AI MVPs and POCs. v1 lives or dies by whether he opens it on his phone every day for 30 days.
- **Secondary user:** the open-source community of AI engineers and quantified-self enthusiasts. Self-hostable in under 4 hours by a developer with basic web-dev experience, well-documented, BYOK-compatible.

Personal use is the *real* success metric. OSS adoption is gravy.

---

## Problem statement

- Single-domain personal tools (Notion, Things, YNAB, Obsidian) don't surface **cross-domain patterns** ("you spend more on gaming when your task completion drops").
- AI-native life trackers (Mem.ai, Spiral, Reflect) charge $10–30/month for what is essentially LLM API calls plus a UI.
- Local-first AI life tools that are **genuinely $0/month at personal scale** are nearly absent from the market.

Pulse occupies the gap: opinionated, AI-native, multi-domain, local-first, free at personal scale, showcase-grade architecture.

The model used at runtime is intentionally *not* a frontier model — it is Groq's Llama 3.x family on the free tier. The **design** is frontier-grade (architected with Opus 4.7 via Claude Code at build time); the **deployed inference** uses cost-zero infrastructure. This split is the heart of the project's positioning: smart system design beats raw model size for narrow personal-life tasks.

---

## Goals (v1)

1. Track **money** (spending + income), **tasks/projects**, and **learning** entries, with **notes** as substrate.
2. **Voice-first entry** via Groq Whisper: ~5 seconds from voice tap to confirmed log.
3. Work on **phone (Android + iOS) and desktop** as one PWA codebase.
4. **Local-first**: instant UI, full functionality offline (read + manual structured write). Voice + AI parsing process when online.
5. **Sync across devices** without manual reconciliation for 7+ days at a time.
6. **Insight engine**: daily / weekly / monthly retrospectives via cron + Groq, surfaced through Web Push + in-app banner.
7. **Self-hostable in under 4 hours** by a developer with basic web-dev experience following the README.
8. **Cross-domain semantic search** via Xata's built-in vector embeddings.
9. **$0/month total runtime cost** at personal scale.

## Non-goals (v1)

- Health, gaming, browsing-history, photo-library domains (v2 plugin slots).
- Bank-API or aggregator integration (paid, per-country messy).
- Native iOS / Android apps (PWA only).
- Team / multi-user collaboration.
- App-store distribution.
- Real-time multi-device collaboration (sync is poll-based, not WebSocket-based, in v1).
- Local LLM inference (no GPU on dev machine).
- Anthropic API at runtime (Claude Code only as a manual side-car for deep retrospectives).
- Custom-domain hosting (the demo deploy lives on `*.pages.dev`; bring-your-own-domain documented).

---

## Architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│                          DEVICE  (PWA)                             │
│                                                                    │
│   UI LAYER — Next.js 15 + React 19 + TS                            │
│   Tailwind 4 + shadcn/ui + Serwist SW (modern next-pwa successor)  │
│   Adaptive: mobile chat-first / desktop hybrid                     │
│                              ▲                                     │
│                              │  Dexie reactive hooks               │
│                              ▼                                     │
│   LOCAL STORE — IndexedDB via Dexie.js                             │
│   *** SOURCE OF TRUTH ***                                          │
│   tables: entities, op_log, voice_queue, sync_meta, settings        │
│                              ▲                                     │
│                              │                                     │
│                              ▼                                     │
│   SYNC ENGINE — HLC + op-log + per-field LWW                       │
│   pull/push ops, conflict resolution, retry on reconnect            │
└──────────────────────────────┬─────────────────────────────────────┘
                               │  HTTPS  (when online)
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│              CLOUDFLARE EDGE  (Pages + Workers, free)              │
│                                                                    │
│  WORKERS / PAGES FUNCTIONS                                         │
│  • /api/sync       op-log push / pull                              │
│  • /api/voice      Groq Whisper transcription                      │
│  • /api/agent      Router → domain agent                           │
│  • /api/insight    Insight Agent (cron-triggered)                  │
│  • /api/auth/*     Better Auth handlers                            │
│  • /api/vision     receipt-photo parse  (v2)                       │
│                                                                    │
│  CRON TRIGGERS                                                     │
│  • daily-insight    07:00 user TZ                                  │
│  • weekly-retro     Sun 19:00                                      │
│  • monthly-retro    1st of month 09:00                             │
└──────────────┬───────────────────────────────────┬─────────────────┘
               ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  XATA POSTGRES  (15 GB free) │    │  GROQ API  (free tier)       │
│  • op_log mirror             │    │  • whisper-large-v3-turbo    │
│  • entity tables (RLS)       │    │  • llama-3.1-8b    (router)  │
│  • vector embeddings         │    │  • llama-3.1-70b   (domains) │
│  • full-text search          │    │  • llama-3.2-90b-vision      │
│  • file attachments          │    │    (receipts, v2)            │
│    (receipts, voice blobs)   │    └──────────────────────────────┘
└──────────────────────────────┘

   CLAUDE CODE SIDE-CAR  (Sheik's subscription)
   Manual export → primed prompt for half-yearly retros, hard
   pattern questions. NOT in hot path. Local on Sheik's machine.
```

### Layer summary

- **Client (PWA)** — Next.js 15 App Router + React 19 + TypeScript + Tailwind 4 + shadcn/ui + Serwist (the maintained PWA service-worker library; `next-pwa` itself is unmaintained). Adaptive layout: mobile chat-first, desktop hybrid (dashboard sidebar + chat panel).
- **Local store** — IndexedDB via Dexie.js. **Source of truth.** Tables: `entities`, `op_log`, `voice_queue`, `sync_meta`, `settings`.
- **Sync engine** — HLC + op-log + per-field LWW. Target ~500 LOC TypeScript; deterministic; property-tested via `fast-check`.
- **Edge (Cloudflare)** — Pages hosts the PWA, Workers/Pages Functions handle API routes, Cron Triggers run scheduled insight generation.
- **Data plane (Xata)** — Postgres with built-in vector embeddings, full-text search, file attachments. 15 GB free tier. Row-Level Security per user.
- **AI runtime (Groq)** — `whisper-large-v3-turbo` (voice), `llama-3.1-8b-instant` (router), `llama-3.1-70b-versatile` (domain agents + insights + query), `llama-3.2-90b-vision` (receipts, v2).
- **Auth** — Better Auth (OSS, edge-runtime-compatible) with magic-link email; sessions stored in Xata.
- **Side-car** — Claude Code (Sheik's existing subscription) as a manual escape hatch for deep retrospectives.

---

## Data model + sync engine

### Hybrid Logical Clock (HLC)

`(physical_ms, logical_counter, device_id)` — total ordering across devices, ~1 ms physical-time accurate, monotonic. New ops always advance past `max(local_clock, last_received_hlc)`. Target ~30 LOC. Property-tested for monotonicity, total ordering, and causal consistency.

### Op-log

Append-only log; idempotent on `op.id`.

```typescript
type Op = {
  id: string                  // uuid; idempotency key
  hlc: string                 // serialized HLC for ordering
  device_id: string
  user_id: string
  entity_kind: 'money' | 'task' | 'project' | 'learning' | 'note'
             | 'category' | 'budget' | 'insight'
  entity_id: string
  op_type: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  schema_version: number      // forward-compat
}
```

Lives in IndexedDB on the client; mirrors to a single Xata `op_log` table. Replaying ops in HLC order on either side produces identical entity state.

### Per-field LWW with tombstones

Each entity row carries `field_hlcs: jsonb`. Apply rule:

```
for k, v in op.payload:
  if op.hlc > row.field_hlcs[k]:
    row[k]            = v
    row.field_hlcs[k] = op.hlc
```

Deletes set `deleted_at` via the same mechanism — resurrection happens automatically if a later op has higher HLC. No special-case code paths.

### Entity tables

| Table | Key columns | Special |
|---|---|---|
| `money_entries` | amount, currency, direction, category_id, occurred_at, description, raw_input | — |
| `tasks` | title, status, priority, project_id, due_at, completed_at | — |
| `projects` | name, status, started_at, ended_at | — |
| `learning_entries` | kind, title, source_url, status, time_spent_min, key_takeaways | **vector**, FTS |
| `notes` | body, linked_kind, linked_id | **vector**, FTS |
| `categories` | name, parent_id, kind, color | — |
| `budgets` | category_id, period, amount, currency | — |
| `insights` | kind, body_md, generated_at, dismissed_at | **vector**, FTS |

All rows carry: `id, user_id, hlc, field_hlcs, deleted_at, created_at, updated_at`. **Row-Level Security** on every Xata table: `user_id = session.user_id` enforced server-side.

Vector + FTS columns on `learning_entries`, `notes`, `insights` enable cross-domain semantic queries as single-SQL operations — no separate vector-DB infrastructure.

### Sync protocol

Single endpoint:

```
POST /api/sync
{
  device_id: "...",
  last_synced_hlc: "...",     // cursor
  new_ops: [ ... local ops since last sync ]
}

Response:
{
  server_hlc: "...",
  new_ops_from_server: [ ... ops this device hasn't seen ],
  applied_ack: [ op_id, ... ]
}
```

Idempotent (op.id is the key). Safe to retry. Replays in HLC order on both sides. Realtime push lever (SSE from Workers) is v1.5, not v1.

### Voice queue

IndexedDB `voice_queue` table: blob, status, created_at, retry_count. Processed on reconnect or app-open while online.

### Determinism guarantees

Property-based tests via `fast-check`:

- Apply N random ops in M random orders → identical final entity state.
- Idempotent: applying same op twice = same state.
- Commutative per-field: order of independent-field ops doesn't matter.
- Monotonic: HLC always advances within a device.

These tests are the *correctness backbone* of the project and are the highest-leverage place Opus 4.7 (at build time) contributes — generating exhaustive adversarial op sequences.

---

## Agent topology + voice pipeline

### Three-tier agent architecture

```
USER INPUT (voice or text)
   │
   ▼
[ /api/voice  →  Groq whisper-large-v3-turbo  →  transcript ]
   │
   ▼
[ /api/agent  →  ROUTER  (Llama 3.1 8B Instant) ]
                  intent ∈ {log_money, log_task, log_project,
                             log_learning, log_note, query, chat}
                  + confidence
   │
   ▼
   ┌────────────┬────────────┬─────────────┬────────────┬─────────────┐
   ▼            ▼            ▼             ▼            ▼             ▼
 money_agent  task_agent  project_agent  learning_agent  notes_agent  query_agent
 (70B)        (70B)       (70B)          (70B)           (70B)        (70B + retrieval)
   │
   ▼
 Zod-validated structured payload
   │
   ▼
 client UI → confirmation chip (✓ / edit / ✗)
   │
   ▼ on accept
 Op generated → applied locally → queued for sync
```

### Why three tiers

- **8B router** is fast and free-tier friendly — classification only, no depth needed.
- **70B domain agents** are *narrow experts* — their prompts contain only that domain's schema, examples, rules; much higher parse accuracy than a generalist.
- New domains in v2 = new domain agent + a Router class label, no other changes.

### Insight agent (async, cron-driven)

```
[ Cron Trigger ]  — daily 07:00 TZ / Sun 19:00 / 1st of month
   │
   ▼
 for each user with settings.insights_enabled:
   ├─ pull cross-domain data slice
   ├─ vector-retrieve relevant past learning
   ├─ Llama 3.1 70B → markdown body + structured highlights
   ├─ embed body → vector → insights row
   ├─ create Op (kind=insight) → applied to op-log
   └─ Web Push (if user opted in)
```

These are *write-side* agents — they generate new content the user reads in the morning.

### Voice pipeline (full)

1. **Capture** — `MediaRecorder` records `audio/webm; codecs=opus`, 16 kHz mono, ~10 s typical.
2. **Local enqueue** — blob written to IndexedDB `voice_queue` (status `queued`).
3. **Upload** — POST blob to `/api/voice` (Worker streams to Groq Whisper); returns transcript + language tag.
4. **Route** — transcript flows into `/api/agent` (same code path as typed entry).
5. **Confirm** — UI shows the parsed structured payload as an editable chip: *"Log ₹80 → food / chai? ✓ ✏️ ✗"*
6. **Commit** — on accept: op generated locally → IndexedDB op_log + materialized → queued to sync.

### Why confirmation chip (not auto-commit)

- Whisper transcription has ~2–5% error rate even in good conditions.
- Auto-committing would silently corrupt data and erode trust in the AI.
- One-tap confirmation costs ~1 s of friction for permanent data trust.
- Editable inline — fix the wrong field, then accept.

### Failure modes + fallbacks

| Failure | Fallback |
|---|---|
| No network at capture | Blob queued locally; processed on reconnect. UI shows "queued for AI processing" badge. |
| Whisper transcription fails | Error toast + dedicated text input "type what you said" |
| Router confidence < 0.7 | Inline disambiguation chip: "Did you mean to log spend or task?" |
| Domain-agent Zod validation fails | Auto-retry once with parse error in prompt; if still fails, show transcript + manual entry form |
| Groq rate-limit hit | Exponential backoff (3 s → 9 s → 27 s); UI shows "AI busy, retrying" |
| Cron run fails | Logged; next user-open re-checks for missed insight; manual `/insights/regenerate` endpoint |
| Push delivery (iOS especially) | In-app banner on next open — never rely on push alone |

### Claude Code side-car

Reserved for "give me a deep retrospective of the last 6 months":

- App exports the data slice as JSON to a local file.
- App generates a primed prompt and offers a "Copy to Claude Code" button.
- Sheik pastes into Claude Code (uses his existing subscription, no incremental cost).
- Resulting markdown can be re-imported as an insight entity via a dedicated endpoint.
- $0 incremental cost, Opus-4.7-grade analysis when actually needed.

Not part of the daily flow. Out of the hot path.

### Model choice + rate-limit math

Groq free tier (June 2026) provides per-model RPM caps; exact numbers are checked against Groq's current dashboard at Phase 0 and re-checked at every minor release.

For one user logging ~20 entries/day, the per-model call profile is:

- **Whisper**: ~20 calls/day (one per voice entry)
- **Llama 3.1 8B (router)**: ~20 calls/day
- **Llama 3.1 70B (domain agents)**: ~20 calls/day + 3 cron insights ≈ 23 calls/day
- **Llama 3.2 Vision (receipts, v2)**: ~3–5 calls/day

These are well within Groq's per-model free-tier limits at current personal-scale use. The rate-limit handling code (exponential backoff + queue) is built so that hitting a limit *degrades* gracefully rather than failing — useful both for safety and for OSS adopters whose usage may differ.

For OSS adopters: the README documents the **Bring-Your-Own-Key** path. The agent code is provider-agnostic via a thin LLM-call adapter, so swapping providers (Groq → OpenAI → Anthropic → Ollama) is a one-file change.

---

## Build phases (~12 weeks part-time)

| Phase | Weeks | Goal | Deliverables | "Done" looks like |
|---|---|---|---|---|
| **0 — Foundation** | 1–2 | End-to-end deploy pipeline working | Next.js + Tailwind + shadcn + Serwist scaffold; CF Pages deploy from GitHub; Xata project + minimal schema; Better Auth magic-link; Dexie + op-log + HLC; property-based tests; `/api/sync` round-trip on toy entity | Create a test entity on phone, see it on desktop within seconds |
| **1 — Voice + money** | 3–4 | First real domain end-to-end | MediaRecorder voice capture + voice_queue; `/api/voice` + Whisper; Router (8B); money_agent (70B) + Zod + adversarial tests; confirmation chip UI; money entity + dashboard card | Voice "spent ₹80 on chai" → logged, visible on both devices in <5 s |
| **2 — Tasks + learning + desktop** | 5–6 | All three domains + desktop layout | task_agent, project_agent, learning_agent, notes_agent; vector embeddings on learning/notes; desktop hybrid layout responsive; quick-log forms as AI fallback; basic cross-domain query agent | Big Three working on mobile + desktop; "how am I doing?" returns sensible synthesis |
| **3 — Insights + push + receipt vision** | 7–9 | Feels intelligent + habit-forming | Insight agent (daily/weekly/monthly cron); Web Push registration + delivery; morning summary push; receipt photo via Llama 3.2 90B Vision; anomaly detection; daily snapshot strip on mobile | Push lands in morning with overnight insight; tap to read; voice-log breakfast; daily habit |
| **4 — OSS launch** | 10–12 | Public release | Architecture README + diagrams; self-host instructions; demo deploy; CONTRIBUTING.md + Apache-2.0 LICENSE; public repo + HN/Reddit launch; issue templates; privacy section | Stranger clones repo, sets 3 env vars, has working deploy |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sync engine has subtle determinism bug in production | Medium | **High** | Property-based tests via fast-check; replay every op on apply with idempotency check; full op-log dev panel for forensics |
| Groq free-tier RPM hit during normal use | Low (personal) | Medium | Exponential-backoff queue; BYOK fallback; provider-agnostic LLM adapter |
| iOS PWA push notifications unreliable | **High** | Medium | Always show in-app banner on app-open; never make push the sole trigger of any feature |
| Xata changes free-tier policy or shuts down | Low–Med | **High** | Thin DB adapter; migration script in `/scripts/export-import.ts` from day one |
| Voice transcription accuracy on Indian-English accents | Medium | Low | Confirmation chip catches errors before commit; manual edit always available |
| Daily habit doesn't form | Medium | **High** | Habit design: snapshot at top of mobile chat + morning push + sub-5 s voice log; ship + iterate |
| OSS launch lands with no adopters | High | Low | OSS is gravy; personal daily use is the real win |
| Schema migration breaks data | Low | High | `schema_version` on every op; replay layer migrates forward; never reuse field names; deprecate then drop in next major |
| CF Pages free-tier build cap (500/month) | Low | Low | ~60 builds/month under typical dev pace |
| Sensitive financial data on free-tier infra | Low | Medium | Optional client-side encryption with passphrase for money_entries; RLS in Xata; threat model documented in README |

---

## Success criteria for v1 ("shipped" means)

- [ ] Sheik logs ≥10 entries/day for **14 consecutive days** using only the deployed PWA on his phone
- [ ] Insight push notification fires **at least weekly** and Sheik actually reads it
- [ ] Sync works on phone + laptop without manual reconciliation for **7 straight days**
- [ ] An unrelated developer follows the README and gets a **working deploy**
- [ ] Sheik can answer *"what changed in my life last month?"* by reading the **Insights feed alone** — no manual querying

---

## Open questions (deferred to implementation-plan phase)

- **Project rename?** Working name "Pulse" is renameable before public launch.
- **Claude Code side-car interface** — manual paste vs. SDK programmatic — TBD based on SDK availability at Phase 4.
- **Encryption at rest for `money_entries`** — opt-in client-side passphrase encryption — v1.5 lever, not v1 must-have.
- **Categories/budgets initial seed** — what default categories ship in v1? Derive from Sheik's first week of use.
- **OSS license** — Apache 2.0 chosen for vendor-friendliness; revisit if community prefers MIT or AGPL.
- **README structure + announcement venue** — finalized in Phase 4.
- **Multi-user OSS tenancy** — v1 is single-user-per-instance; v2 multi-tenant only if adoption justifies.

---

## References

- Cloudflare Pages: <https://developers.cloudflare.com/pages/>
- Cloudflare Workers: <https://developers.cloudflare.com/workers/>
- Cloudflare Cron Triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Xata Postgres + vectors: <https://xata.io/>
- Groq API + models: <https://console.groq.com/docs/>
- Better Auth: <https://www.better-auth.com/>
- Dexie.js: <https://dexie.org/>
- Serwist (modern next-pwa successor): <https://serwist.pages.dev/>
- HLC paper: *"Logical Physical Clocks"* — Kulkarni et al., 2014
- fast-check property testing: <https://fast-check.dev/>

---

## Sign-off

This spec is approved for handoff to the writing-plans skill when Sheik signs off.
