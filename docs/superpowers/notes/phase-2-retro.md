# Pulse Phase 2 retrospective

**Date closed:** <YYYY-MM-DD>
**Duration:** <N> weeks (planned ~7)
**Branch:** feature/phase-2
**Final commit at start of 2.7:** d7dc1e7

## What shipped

- Tasks domain (entity_kind 'task'): voice + text creation with title + due_at + priority; tap-to-toggle completion with strikethrough; long-press context menu (delete)
- Tab bar shell: bottom-fixed on mobile, top-positioned on desktop; URL-stateful via `?tab=`; auto-switches on entry confirmation; scales to 4 tabs for Phase 3+
- Per-user preferences: `/settings/preferences` with IANA timezone autocomplete (~150 zones) + primary currency picker; agents inject userTz + defaultCurrency from prefs
- Multi-currency FX: daily 03:00 UTC cron fetches ECB XML; client converts via cross-rate through EUR; MoneyCard sums non-primary entries with footnote
- Voice SSE streaming: `/api/voice` returns event-stream with 4 step events (transcribing → transcript → parsing → payload); UI shows step-by-step feedback
- query_money agent: read-only agent returns a query plan; client executes against Dexie; QueryAnswerCard renders total in primary currency
- Cross-cutting: format.ts helper for localized dates; SUPPORTED_CURRENCIES set used consistently; 5-intent Router (was 3); `_-prefix` lint convention extended to Phase 2 files
- 308 tests (+128 new on top of Phase 1's 180)

## Success criteria verification

Run the smoke tests on real devices (phone + desktop, same magic-link account). Check each box as you verify:

### Behavioral
- [ ] Voice "remind me to call mom tomorrow at 3pm" → confirmed → visible on second device within 10s; `due_at` parsed correctly for user TZ
- [ ] Voice "urgent: file taxes today" → task with `priority='high'`, `due_at=today`
- [ ] Tap any open task → instant strikethrough + sync within 10s; tap again to un-complete
- [ ] Filter pill (Open / Completed / All) updates without re-fetch
- [ ] Tab auto-switches: type "spent ₹80 on chai" on Tasks tab → confirm → switches to Money
- [ ] Voice "how much did I spend last week" → answer card with correct total + period label; auto-dismisses after 30s
- [ ] Change TZ in /settings/preferences from Asia/Kolkata → America/New_York → next voice "tomorrow at 3pm" resolves to NY-local
- [ ] Log a $5 (USD) entry while primary = INR → MoneyCard headline shows total in ₹ with conversion footnote; MoneyList row shows native $5.00
- [ ] Voice SSE: tap mic → speak → stop → see "Listening… → I heard: 'X' → Understanding… → chip" progressing in real time
- [ ] 7 consecutive days of mixed voice entries (money + tasks): no missed parses, no chip stalls (long-running)
- [ ] Recurring rules from Phase 1 continue firing daily for ≥7 days without missing fires (long-running)

### Technical
- [ ] **≥280 tests passing in CI** (target: 280+; achieved: 308)
- [ ] task_agent adversarial mock: ___ / 30 (target ≥95% = 29/30)
- [ ] task_agent adversarial real-Groq: ___ / 30 (target ≥95%)
- [ ] query_money adversarial mock: ___ / 20 (target ≥95% = 19/20)
- [ ] query_money adversarial real-Groq: ___ / 20 (target ≥90% = 18/20)
- [ ] Voice round-trip latency: median ≤3s, p95 ≤6s
- [ ] FX cron fires daily at 03:00 UTC for ≥7 days; `wrangler tail` confirms hits
- [ ] Recurring cron continues firing; 0 regressions
- [ ] CI workflow green on `main` after merge
- [ ] No Phase 0/1 regressions — `pnpm test -- tests/{op-log,sync-server,sync-client,sync-integration,hlc,seed-categories,recurring,voice-queue}.test.ts` all green
- [ ] `pnpm audit` reports zero vulnerabilities
- [ ] Lint clean; typecheck clean

## Latency measurement

DevTools → Network. Record 5 voice round-trips back-to-back (one minute apart). Note times for `/api/voice` SSE stream (total from POST start to final `data: payload` event):

| Trial | Whisper (ms) | Router (ms) | Agent (ms) | Total (ms) |
|-------|--------------|-------------|------------|------------|
| 1     | ___          | ___         | ___        | ___        |
| 2     | ___          | ___         | ___        | ___        |
| 3     | ___          | ___         | ___        | ___        |
| 4     | ___          | ___         | ___        | ___        |
| 5     | ___          | ___         | ___        | ___        |

- Median total: ___ ms (target ≤3000)
- p95 total: ___ ms (target ≤6000)

Compare against Phase 1 retro's latency numbers — has SSE changed perceived latency? Should be similar wall-clock but with better progress feedback.

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

## Deferred to Phase 3

- Recurring tasks (cron-fired OR repeat-on-completion)
- Tasks: tags / projects / sub-tasks / descriptions
- query_money: by-category / delta / list query types
- query_task agent (any read-only agent against tasks)
- Push notifications for due tasks
- Insight engine + weekly retros
- Receipt photo parsing (Llama 3.2 Vision)
- Multi-primary currency (one for personal, one for travel)
- Manual FX rate override UI
- Cross-tab voice-queue race fix (still open from Phase 1)
- Learning + Notes domains (Phase 3+, the remaining Big Four)

## Open issues from Phase 2

(Carry forward to Phase 3 backlog)

- Task 3 (dexie.ts:115): `EntityTable<FxRateRow, any>` — Dexie 4's `EntityTable<T, K>` generic doesn't accept compound keys as string literals; suppressed inline. Consider `Table<FxRateRow>` fallback in Phase 3 for tighter typing.
- Task 23 (/settings/preferences): TZ list buttons lack `aria-selected`; save-error surface is silent (console-only). Bump to visible toast in Phase 3.
- Task 23: local state refactored to combined object during implementation — cosmetic deviation from brief but functionally equivalent.

## Phase 3 prereqs

Before Phase 3 starts:
- [ ] Sheik verifies all behavioral success criteria above (multi-day observation)
- [ ] Real-Groq adversarial eval confirms ≥95% pass for task_agent + ≥90% for query_money
- [ ] FX cron fires daily for ≥7 days (`wrangler tail`)
- [ ] No regressions in Phase 1 (recurring cron, money sync, voice voice-queue)
- [ ] Merge `feature/phase-2` → `main`; tag as `v2.0-phase-2`
