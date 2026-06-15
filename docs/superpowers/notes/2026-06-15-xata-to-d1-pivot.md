# Pivot: Xata → Cloudflare D1

**Date:** 2026-06-15
**Triggered by:** Phase 0 Task 7 attempt (Xata CLI setup)
**Decision:** Replace Xata with Cloudflare D1; the all-Cloudflare stack ("Combo A" from initial stack research) replaces the Cloudflare + Xata stack ("Combo B").

## Why

Two signals during execution:

1. **`@xata.io/client` (Phase 0 Task 2)** — installed cleanly but flagged as deprecated on npm. Last published 2 years prior. Combined with documentation drift on the Xata side suggested the managed-DB product was on the way out.
2. **`@xata.io/cli` (Phase 0 Task 7 setup)** — `pnpm add -g @xata.io/cli` returned 404 from registry.npmjs.org. The package shows on npm's search index (last published a year ago) but actual install fetches fail.

Xata's GitHub now describes the project as "Open source, cloud native, Postgres platform with copy-on-write branching and scale-to-zero" — they pivoted to be a self-hostable Postgres *distribution*, not a managed BaaS. The managed cloud product our spec assumed is effectively in cold storage.

## What changes

| Layer | Spec said | Now |
|---|---|---|
| Database | Xata Postgres (15 GB free) | **Cloudflare D1** (SQLite, 5 GB free) |
| File storage | Xata file attachments | **Cloudflare R2** (10 GB free) |
| Vector search | Xata built-in vector embeddings | **Deferred to v2** via `sqlite-vec` extension or external service; not needed for Big Three v1 |
| Full-text search | Xata built-in FTS | **SQLite FTS5** (built into D1) |
| Better Auth adapter | Xata adapter | **Kysely adapter + `kysely-d1` dialect** (Better Auth's recommended pattern for D1) |
| Local DB connection | `@xata.io/client` from `XATA_API_KEY` + `XATA_DATABASE_URL` env vars | **D1 binding via Wrangler** (`env.DB` in Worker; `wrangler dev --persist` locally) |
| DB schema definition | `xata/schema.json` | **SQL DDL via `migrations/0001_initial.sql`** applied via `wrangler d1 execute pulse --file=migrations/0001_initial.sql` |
| Codegen | `xata init` generates typed client | **Kysely codegen via `kysely-codegen` against the D1 schema** (or hand-rolled types in `src/types/db.ts` for Phase 0) |
| Realtime push | Xata Realtime (was deferred to v1.5 anyway) | **Polling** in Phase 0; SSE from Worker as the v1.5 lever |

## What does NOT change

- The HLC + op-log + per-field LWW sync engine — all 41 tests still pass; the sync code is database-agnostic by design.
- The wire-protocol contract for `/api/sync` — unchanged (`{device_id, last_synced_hlc, new_ops} → {server_hlc, new_ops_from_server, applied_ack}`).
- Groq as AI runtime (Whisper + Llama 3.x).
- The OSS-portfolio framing and $0-runtime budget — actually *improved* (single provider, simpler self-host).
- Better Auth as the auth library (just a different adapter underneath).
- Phase 0 success criteria — the toy-Widget round-trip phone↔desktop still works the same way; only the storage backend differs.

## Task-level deltas (Phase 0 plan)

- **Task 2 (deps)** — `@xata.io/client` is dead weight. To be removed in the cleanup subagent; replaced by `wrangler` (dev dep), `kysely`, `kysely-d1`, and `better-auth` (already installed). The cleanup subagent also adds `@cloudflare/workers-types` for typing the D1 binding.
- **Task 7 (DB setup)** — Replaced inline: `wrangler d1 create pulse` (no browser flow; uses the Wrangler login Sheik will do once during Cloudflare onboarding); write `migrations/0001_initial.sql`; `wrangler d1 execute pulse --file=migrations/0001_initial.sql --local` for local; apply remotely in T21.
- **Task 8 (Better Auth)** — Use Kysely adapter wired against the D1 binding instead of the Xata adapter.
- **Task 17 (Server `/api/sync`)** — Worker reads/writes `env.DB` (the D1 binding) via Kysely; no Xata-specific code.
- **Task 23 (Persistent auth)** — Better Auth + Kysely + D1 from Task 8; Task 23 collapses to a verification + cleanup step.

## Why this is actually better

- Single provider (Cloudflare for hosting + functions + DB + storage + cron + push)
- No second dashboard, no second free-tier policy to watch
- SQLite on both sides of the sync engine (Dexie client + D1 edge) = dialect-identical replay; one SQL syntax for everything
- Wrangler CLI is non-interactive after first `wrangler login` (which we do once during the CF Pages connect in T21); no per-task browser detour
- Defers vector + semantic-search complexity to when we actually have data that benefits from it (Phase 2-3)
- Self-host story improves: stranger clones repo, runs `wrangler d1 create pulse`, applies migration SQL — one command less than the Xata path

## Risks accepted

- D1 free tier is 5 GB vs Xata's claimed 15 GB. For a single user's spending + tasks + learning data over years, 5 GB is still ~5-10× headroom. Public OSS adopters will be capped at 5 GB on free tier and need to bump to D1's $5/mo paid tier or self-host. Documented.
- D1 has a 100k row-writes/day limit on the free plan. At ~20 entries/day per user, an OSS instance with ~5000 active users would hit this. Acceptable for personal scale; flagged in README for self-hosters who scale.
- D1's vector capability is via the experimental `sqlite-vec` extension; we don't use it in Phase 0, but Phase 2 semantic search will need design work that Xata would have given us for free.

## References

- Cloudflare D1: https://developers.cloudflare.com/d1/
- D1 limits + pricing: https://developers.cloudflare.com/d1/platform/limits/
- Kysely + D1: https://kysely.dev/docs/dialects/d1
- Better Auth Kysely adapter: https://www.better-auth.com/docs/adapters/sqlite
- sqlite-vec (for v2): https://github.com/asg017/sqlite-vec
