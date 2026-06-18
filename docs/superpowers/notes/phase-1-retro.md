# Pulse Phase 1 retrospective

**Date closed:** <YYYY-MM-DD>
**Duration:** <N> weeks (planned 5–6)
**Branch:** feature/phase-1
**Final commit at start of 1.6:** b605d36

## What shipped

- Voice money entry (Whisper → Router → money_agent on Groq)
- Manual money entry (typed-text fallback through /api/agent)
- Categories (14 seeded defaults + user CRUD)
- Recurring rules (chip toggle + Settings CRUD + daily cron at 02:00 UTC)
- MoneyCard dashboard (headline + delta vs previous + top 3 categories)
- Adaptive layout (mobile snapshot strip, desktop sticky sidebar)
- Long-press context menu + undo-toast deletes
- Cron security: `CRON_SECRET` bearer-token auth
- Sync: HLC + op-log foundation extended to money/recurring/category entity kinds
- 180 tests (130 new on top of Phase 0's 50)

## Success criteria verification

Run the smoke tests on real devices (phone + desktop, same magic-link account). Check each box as you verify:

### Behavioral
- [ ] Voice "spent 80 on chai" → confirmed chip → visible on second device, all within 10 seconds
- [ ] User toggles "Recurring" + picks "monthly" + confirms → rule appears in Settings → Recurring; the next morning (or after manual cron POST) the entry auto-fires
- [ ] User edits a past entry's category → both devices reflect within 10 seconds
- [ ] User says "got salary 85000 yesterday" → entry direction=in, category=Salary, occurred_at=yesterday
- [ ] User logs ≥3 voice entries per day for 7 consecutive days (trust threshold — long-running)
- [ ] Recurring rules run for ≥7 days unattended without missing fires (long-running)

### Technical
- [ ] ≥120 tests passing in CI (achieved: 180 / target: ≥120 ✓)
- [ ] money_agent adversarial set ≥95% mock pass rate (`pnpm test -- tests/agents/money-agent.test.ts` → ___ / 50)
- [ ] money_agent adversarial set ≥95% real-Groq pass rate (`pnpm exec tsx scripts/eval-agents.ts` → ___ / 50)
- [ ] Voice round-trip latency: median ≤3s, p95 ≤6s
- [ ] CI workflow green on `main` after merge
- [ ] No Phase 0 sync property-test regressions (`pnpm test -- tests/op-log.test.ts` and `tests/sync-server.test.ts` both green)

## Latency measurement

Open Chrome DevTools → Network panel. Record 5 voice round-trips back to back (one minute apart so Groq doesn't rate-limit). Note times for `/api/voice`:

| Trial | Whisper (ms) | Router (ms) | money_agent (ms) | Total (ms) |
|-------|--------------|-------------|------------------|------------|
| 1     | ___          | ___         | ___              | ___        |
| 2     | ___          | ___         | ___              | ___        |
| 3     | ___          | ___         | ___              | ___        |
| 4     | ___          | ___         | ___              | ___        |
| 5     | ___          | ___         | ___              | ___        |

- Median total: ___ ms (target ≤3000)
- p95 total: ___ ms (target ≤6000)

If p95 > 6000 ms, the slowest step is usually money_agent (70B). Consider a fallback to 8B for short utterances in Phase 2.

## What worked

(Fill in observations from your week+ of using the app.)

-
-
-

## What we'd do differently

(Fill in pain points / surprises.)

-
-
-

## Deferred to Phase 2

These were explicitly out of scope per the spec; surfacing here as the Phase 2 backlog:

- `query_money` agent ("how much did I spend last week") — pairs with insight engine
- Voice progress streaming (SSE) — replace single-spinner with "transcribing… parsing…"
- Voice-detected recurring (hybrid auto-detect mode)
- Per-user time-zone cron (currently 02:00 UTC global)
- Multi-currency FX conversion in dashboard totals
- Receipt photo parsing (Llama 3.2 Vision)
- Insights / push notifications / weekly retros
- Tasks / projects / learning / notes domains

## Open issues noted during Phase 1 (rolled into Phase 2 backlog)

- Cross-tab voice-queue race (current guard is in-process only; cross-tab needs sync_meta or BroadcastChannel)
- Week-start cultural assumption (currently Monday; US users would prefer Sunday)
- The "TODO Phase 1.6: route to /settings/recurring" comment in MoneyList is now wired (was the long-press menu's recurring-entry option in T26)
- OpenNext + Cloudflare `scheduled()` handshake: verify the cron actually fires post-deploy with `wrangler tail`; shim Worker fallback documented in T23 if needed
- Dependabot vulnerabilities on default branch (2 high, 1 moderate, 1 low) flagged on every push — triage separately

## Phase 2 prereqs

Before Phase 2 starts:
- [ ] Sheik verifies all 6 behavioral success criteria above (some require multi-day observation)
- [ ] Real-Groq adversarial eval (`scripts/eval-agents.ts`) confirms ≥95% pass rate
- [ ] Cron actually fires once daily in production (`wrangler tail` shows the route hit at 02:00 UTC)
- [ ] Merge `feature/phase-1` → `main`; tag as `v1.0-phase-1`
