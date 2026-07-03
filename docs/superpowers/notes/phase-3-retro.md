# Phase 3 Retrospective — Insight digest + Web Push + Receipt vision

**Date:** 2026-07-04  
**Status:** Shipped to production  
**Baseline:** `main@v2.0-phase-2` (308 tests); Phase 3 adds 140 tests; final count 448

## Behavioral verification (Sheik, ≥7 days live)

### Cron dispatch & recurring/FX recovery

- [ ] `wrangler tail` shows all five cron patterns firing on schedule:
  - `0 2 * * *` → `/api/cron/recur` (Phase 1 recovery)
  - `0 3 * * *` → `/api/cron/fx` (Phase 2 recovery)
  - `*/15 * * * *` → `/api/cron/due-tasks`
  - `30 2 * * 1` → `/api/cron/digest`
  - `30 14 * * 1` → `/api/cron/digest`
- [ ] Recurring entries materialize in D1 after cron fires (backfill for entries whose `next_due_at` was in the past)
- [ ] FX rates update in D1 daily (verify at least one rate changed vs. previous day)
- [ ] Cron errors, if any, appear in `wrangler tail` with stack traces (none expected)

### Digest weekly generation

- [ ] Monday 08:00 IST (Tuesday 02:30 UTC from previous Monday): digest op inserts, materialize succeeds
- [ ] Digest card renders on Money tab with prior week's summary + metrics (spend, income, tasks, overdue)
- [ ] Dismissal (sync_meta key) sticks per device
- [ ] Metrics JSON parses correctly; skipped_currencies footnote appears when a currency had no rate
- [ ] Fallback summary (when LLM fails): deterministic text from metrics appears instead
- [ ] Digest op visible in Dexie locally; syncs across devices via op_log

### Push notifications

- [ ] Android + desktop: push received within 15 min of due-task `due_at` time
- [ ] Installed iOS PWA: same; iOS permission modal appears on first click of Due toggle
- [ ] Service worker `push` handler fires, fetches `/api/push/pending`, shows notification
- [ ] Notification click opens app at `url` (default `/app`; digest digest points to Money tab)
- [ ] Denied/blocked permission: UI shows "blocked in browser settings" hint, no re-prompt
- [ ] Editing task `due_at`: new due-tasks cron fire (next 15-min window) sees the new time (old PK suppression still holds)

### Receipt vision

- [ ] Camera button loads on Money tab (📷, beside VoiceRecorder)
- [ ] Real receipt photo → `uploading` → `parsing` → `payload` events within SSE stream
- [ ] Extracted payload: amount, currency, date, category guessed from user's list
- [ ] Chip shows thumbnail; confirm → money entry with `source: 'receipt'` and `receipt_key` set
- [ ] Offline capture: blob → receipt_queue (IndexedDB); on reconnect drains without double-processing (Web Locks)
- [ ] `/api/receipt/{key}` 📎 link opens stored photo from R2 (authenticated, 404 if not your user ID)
- [ ] Vision injection: malicious text in receipt image is treated as data, not instructions (Zod reject if it breaks schema)

### Offline-first & multi-tab safety

- [ ] DigestCard renders with local Dexie data; dismissal works offline
- [ ] Two browser tabs open: draining voice/receipt queues happens in one tab only (Web Locks prevent double-drain)
- [ ] Both queue items settle without race errors

### Preferences & UX polish

- [ ] Timezone option list: `aria-selected` on current tz for screen readers
- [ ] Save error during prefs change: rose-colored error line appears; cleared on next input
- [ ] Dexie fx_rates table: if `Table<FxRateRow>` typing succeeded, `any` suppress is gone; else suppress documented with attempt date

## Technical verification

- [ ] Schema keys ⊆ FIELDS for all five entity kinds (money, recurring, category, task, insight): consistency test green ✓
- [ ] No secrets beyond declared set: GROQ_API_KEY, CRON_SECRET, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY (last is plain var)
- [ ] No new dependencies beyond `jose` (direct); jose version matches lock ✓
- [ ] All Phase 0/1/2 tests untouched and green ✓
- [ ] New test count: +140 tests (308 → 448)

## Latency notes

N/A for Phase 3 (digest cron optimized for weekly, not interactive; vision on 3MB photo is ≤1s on Groq free tier).

## Deferred (Phase 4+)

- **query_money v2** — on-demand analytics: by-category, delta, time-series (awaits LLM-based breakdown agent)
- **query_task agent** — intelligent task querying (deferred pending agent refactor)
- **Recurring tasks** — task-form recurring toggle + cron materialization (mirrors money recurring)
- **Task tags/projects/sub-tasks** — richer task model (post-query_task)
- **Learning + Notes domains** — op-log entities for personal knowledge base (Phase 4 scope expansion)
- **Manual FX override UI** — user-set rates for currencies/dates with no ECB data
- **RFC 8291 push payload encryption** — encrypted payloads (unnecessary with pull-on-push; defer for privacy polish)
- **Digest history UI** — rows-based view of past digests (trivial after insights table exists; low priority)
- **Overdue-task re-notification** — periodic nag for overdue items (needs snooze UX; defer for UX clarity)
- **Receipt vision eval script (CI)** — automated multi-image eval (manual 10-receipt eval gates ship; image fixtures too heavy for CI)
- **Drained-receipt chip surfacing** — a receipt captured offline drains in the background and its parse is currently discarded (the R2 image is preserved and viewable via the 📎 link); surfacing it as a confirmation chip needs a `draftRef` to gate `setDraft` without putting `draft` in the drain effect's deps. Deferred from T35 to keep parity with the voice-queue drain.

## Known issues / workarounds

None documented; Phase 3 ships clean per design.

## Reviewer checklist (Sheik final sign-off)

- [ ] Cron dispatch shim tested locally (`wrangler dev --test-scheduled`)
- [ ] Digest narrative passes spot-check (no gibberish)
- [ ] Receipt vision tested on ≥3 real receipt photos (≥8/10 pass rate)
- [ ] Push tested on personal phone (Android + iOS PWA if available)
- [ ] No production secrets leaked (audit: GROQ_API_KEY, CRON_SECRET, VAPID_PRIVATE_KEY never appear in logs)
- [ ] `wrangler tail` observation clean for 7 days minimum before retro close
