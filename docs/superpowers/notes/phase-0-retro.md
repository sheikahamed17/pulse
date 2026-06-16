# Phase 0 — Retrospective

**Closed:** 2026-06-16
**Latest commit:** `ea3754f` — fix(auth): map Better Auth fields to snake_case columns
**Deployed URL:** https://pulse.sdsheikahamed.workers.dev/
**Tests on `main`:** 50 passing (property-tested HLC + op-log + Dexie + sync engine + integration)

## Success criteria (from the spec)

- [x] Sheik signs in via magic link on phone + desktop
- [x] Add a widget on phone → appears on desktop within ~10 s (sync polling interval)
- [x] Add a widget on desktop → appears on phone within ~10 s
- [x] Better Auth sessions persist (implicitly verified — every authenticated sync round-trip uses the session)
- [x] CI pipeline green on `main` (lint + typecheck + test on Linux runner)
- [x] Deployment from CI to Cloudflare Workers (GitHub Actions → wrangler deploy)

Phase 0 closed.

## What went well

- **HLC + op-log property tests (`tests/op-log.test.ts`) caught zero bugs in real-world use.** 400 randomized op sequences with byte-perfect equality assertions across replay orders gave us high confidence before deploy. The deterministic timestamps (`hlcToIso`) the T13 implementer added were a strict improvement over the plan's wall-clock approach.
- **Adaptive UI worked out of the box** — mobile chat-first / desktop hybrid layouts shipped without re-design after the first build. The shadcn primitives (Button, Input, Label, Card) + Tailwind responsive classes were enough.
- **The TDD discipline held through correctness-critical work.** Tasks 10–14 (HLC + op-log + property tests) followed test → fail → impl → pass → commit cycles strictly. Tasks 15–19 (Dexie + client sync + integration) followed the same pattern. No regressions appeared during T20–T22.
- **Subagent-driven execution shipped 19 of 24 tasks autonomously** with brief controller-side review. The two-stage review (spec + quality) caught real issues on Task 1 (stale package name, missing `packageManager` field).

## What was slower than estimated

- **Deploy pipeline took ~10x longer than budgeted.** Plan estimated T21 at ~15 min subagent + ~10 min user. Actual: ~6 hours of back-and-forth across multiple failure modes.
- **Five separate deploy-time bugs surfaced sequentially**, each masking the next:
  1. Empty `main` branch on first dashboard "Save and Deploy" (`main` had only spec + plan).
  2. Eager env-var validation at module load (Zod parseEnv crashed during Next.js "Collecting page data" step).
  3. Worker build OK but wrangler.toml lacked `main` + `[assets]` (deploy step "Missing entry-point").
  4. `runtime = 'edge'` directive fighting OpenNext's Workers-runtime wrapper (TypeError reading 'default').
  5. `process.env` vs Workers `env` mismatch (secrets in dashboard didn't reach `parseEnv(process.env)`).
- **Local OpenNext builds on Windows are unreliable.** Even with `nodeLinker: hoisted` workaround, the produced bundle had ChunkLoadErrors at runtime that Linux builds didn't have. **Phase 1+ should never deploy from Windows local** — only via the GitHub Actions Linux runner.

## Bugs found (real correctness issues, not config drift)

- **`getCloudflareContext({ async: true })`** — a hypothesis-driven fix that didn't actually solve the original symptom, but was harmless. Kept the sync variant since `buildAuth()` only runs per-request anyway.
- **Better Auth column-name convention mismatch** — schema used snake_case (matching sync-engine tables); Better Auth expected camelCase. Fixed via per-table `fields:` config mapping. **Worth filing for Phase 4**: extract the mapping into a constants file so the table → field map is in one place if we ever add more domains backed by Better Auth.

## Decisions deferred / revisited

- **Xata → Cloudflare D1** (mid-build pivot, see `docs/superpowers/notes/2026-06-15-xata-to-d1-pivot.md`). Xata's npm packages were stale/deprecated and the CLI 404'd. The pivot to D1 also simplified the architecture (single Cloudflare provider). **Net positive change**, accepted as a non-regression.
- **Vector + FTS deferred to Phase 2** — without Xata's built-in vectors, we don't have semantic search yet. Phase 2 will add either `sqlite-vec` extension on D1 (if Cloudflare exposes it) or an external embedding service. Big Three v1 doesn't need it.
- **Local Windows OpenNext build path** — multiple workarounds tried (.npmrc / pnpm-workspace nodeLinker hoist). None reliably produced working Worker bundles. **Phase 1+ standard**: develop on Windows, deploy from GitHub Actions Linux runner. The OpenNext team's own warning ("not fully compatible with Windows") matches our experience.
- **Workers Builds vs GitHub Actions for CI deploy** — Workers Builds didn't auto-trigger on push despite production branch being set; we never fully diagnosed why. GitHub Actions chosen as the canonical pipeline going forward — single workflow file in source, no hidden Cloudflare-side config.

## Phase 1 prereqs to confirm before starting

- [ ] **Groq API key works** — test a Whisper call from the deployed Worker: hit a future `/api/voice` route with a tiny audio blob, confirm transcription returns.
- [ ] **Microphone permission flow in PWA mode** — Android Chrome + iOS Safari both need to grant mic access from a home-screen installed PWA. Test before designing the voice UI.
- [ ] **D1 usage tracking** — check Cloudflare dashboard for current row count, growth rate. Phase 1 will multiply ops/day by ~10×. Free tier is 5 GB / 100k writes/day — comfortable, but worth a baseline.
- [ ] **GitHub Actions build minutes consumed** — currently ~3 min per deploy. Phase 1 will deploy more frequently. 2000 free minutes/month → ~660 deploys. Fine.
- [ ] **API token D1 permissions** — current `CLOUDFLARE_API_TOKEN` doesn't include D1:Edit. The GH Actions D1-migration step fails. Either (a) regenerate the token with both Workers + D1, or (b) remove the migration step from CI and apply migrations manually before each schema change.

## Architecture changes to consider before Phase 1

- **Extract Better Auth field mapping** to a constants file so Phase 2 (when sync schema grows to money/tasks/learning tables) doesn't duplicate this pattern.
- **Add `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`** to Better Auth config — eliminates the "rate limiting falling back to shared per-path bucket" warning. ~3-line change.
- **Decide on local dev story for OSS contributors.** The README should say: clone, `pnpm install`, set env vars, `pnpm exec wrangler login`, deploy via `pnpm exec wrangler deploy`. Skip local OpenNext builds. Document the WSL2 alternative for contributors who want full local preview.
- **Service worker (`public/sw.js`) is currently a build artifact getting committed.** Phase 4 OSS polish: add to `.gitignore`. Right now CI regenerates it on every build and we get noise diffs.
- **3–4 Dependabot vulnerabilities open** (2 high, 1 moderate, 1 low). Before Phase 4 public launch, audit each — most are likely transitive dev-deps with safe upgrades.

## Cleanup items for Phase 1 kickoff

- [ ] Remove the `/api/ping` route (diagnostic, served its purpose)
- [ ] Remove the empty `src/app/api/sw/` directory leftover
- [ ] Add `public/sw.js` to `.gitignore`
- [ ] Fix the GH Actions D1 token permissions (one of: regenerate token, or remove D1 step from CI)
- [ ] Add per-IP rate-limit header config in `auth.ts`
- [ ] Update `docs/superpowers/specs/2026-06-15-pulse-design.md` with a brief pivot addendum (Xata → D1, deploy via GitHub Actions, OpenNext-Windows incompatibility note)

## Quiet wins worth remembering

- **Property tests work.** The `applyOps` invariants (commutative for independent fields, idempotent, deterministic-on-HLC-order) were tested 400 times in CI and never caught a real bug — but also never regressed across 24 commits. That's exactly the value: the test suite stayed reliable so refactors stayed safe.
- **The brainstorming → writing-plans → subagent-driven-development workflow held.** Spec drove plan; plan drove tasks; subagents implemented tasks with two-stage review. The structure made it possible to debug deploy issues without losing the thread of "where are we in Phase 0."
- **The Xata → D1 pivot was a project-saving call.** If we'd insisted on Xata after the 404 + deprecation warning, the project would have stalled. The willingness to swap a planned dependency mid-build is a real skill — having the docs (`2026-06-15-xata-to-d1-pivot.md`) explaining *why* in source means future-Sheik and future-contributors don't relitigate the choice.

## Commits

Phase 0 landed in ~40 commits on `main`. The big architectural ones:

- `a141218` — initial spec
- `4055991` — Phase 0 plan
- `daa075d` — Next.js scaffold
- `73d4a37` — HLC
- `7bfd861` — op-log per-field LWW
- `dc52447` — Dexie store
- `304d33f` — client sync engine
- `c8cc196` — client `pushPullOnce`
- `0c920f1` — server `/api/sync`
- `2fb1cb7` — Widget UI + sync polling
- `1dff7e6` — D1 + Kysely
- `caf39d8` — Better Auth + OpenNext
- `e703b23` — login UI
- `a528a4c` — Xata→D1 pivot doc
- `2b8b7c6` — GitHub Actions deploy
- `1a972c7` — read auth secrets from Workers env
- `ea3754f` — Better Auth field mapping

The fix-iteration commits are also part of the story — they show *what we learned* deploying. Worth preserving in history (don't squash before merge for OSS launch — the iterative pattern teaches future contributors which knobs matter).
