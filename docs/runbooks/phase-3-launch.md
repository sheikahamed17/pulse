# Phase 3 Launch Runbook

**Audience:** Sheik (manual one-time steps before Phase 3 ship to production)

## Pre-deployment

### 1. Generate VAPID keypair

Run once to generate a new keypair for Web Push signing:

```bash
node scripts/generate-vapid-keys.mjs
```

Output will be two lines:
```
VAPID_PUBLIC_KEY="<base64-encoded uncompressed P-256 public point>"
VAPID_PRIVATE_KEY='<JSON-stringified JWK private key>'
```

**Keep these values safe.** The private key is secret #3; the public key is a plain var (safe to commit post-setup).

### 2. Provision VAPID_PRIVATE_KEY to Cloudflare Workers secrets

```bash
wrangler secret put VAPID_PRIVATE_KEY
```

Paste the entire JSON-stringified value (the part after `VAPID_PRIVATE_KEY='...`). Wrangler will prompt and securely store it.

### 3. Add VAPID_PUBLIC_KEY to wrangler.toml

Edit `wrangler.toml` and add a `[vars]` section with the public key (if not already present):

```toml
[vars]
VAPID_PUBLIC_KEY = "<base64 value from generate-vapid-keys output>"
```

Commit this file (the public key is not secret).

### 4. Set GitHub Actions variable for build-time

In your GitHub repo settings (Settings → Secrets and variables → Variables), add:

**Variable name:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  
**Value:** (same base64 value as in wrangler.toml)

This variable is injected into the build step of `.github/workflows/deploy.yml` so the client-side push code can access the public key at build time.

### 5. Verify CRON_SECRET is provisioned

```bash
wrangler secret list
```

Confirm `CRON_SECRET` is present (should exist from Phase 1). If missing, add it:

```bash
wrangler secret put CRON_SECRET
```

Provide a 32+ character random value (e.g., from `openssl rand -base64 32`). This secret gates all cron route POST requests.

### 6. R2 bucket auto-creation

The deploy workflow includes a step to create the `pulse-receipts` R2 bucket if it doesn't exist:

```bash
wrangler r2 bucket create pulse-receipts
```

This is already in the CI pipeline with `continue-on-error: true`, so you can skip manual creation unless you need to test locally. Verify post-deploy:

```bash
wrangler r2 bucket list
```

Should show `pulse-receipts` in the list.

## Deployment

### 7. Deploy to Cloudflare Workers

Standard deploy:

```bash
git push origin main
```

CI will:
1. Run lint, typecheck, test (all must pass)
2. Build Next.js + OpenNext (`pnpm cf:build`)
3. Create the R2 bucket if absent (`continue-on-error: true`), then deploy via `wrangler deploy`
4. **Attempt** D1 migrations 0001–0004 — but these steps run `continue-on-error: true` because the deploy API token lacks the `D1:Edit` scope (see the comment in `.github/workflows/deploy.yml`). They will silently fail until the token is upgraded, so the Phase 3 migration must be applied manually (next step).

Monitor the GitHub Actions tab for any failures. On success, the production URL (https://pulse.sdsheikahamed.workers.dev) is live.

### 7b. Apply the Phase 3 D1 migration manually (REQUIRED)

Because CI's D1-migration steps `continue-on-error` past a token-scope failure, apply migration 0004 yourself from a machine logged in with a token that has `D1:Edit` (the same way Phase 0–2 migrations were applied):

```bash
wrangler d1 execute pulse --remote --file=migrations/0004_phase_3_insight_push_receipts.sql
```

Then verify the Phase 3 tables exist:

```bash
wrangler d1 execute pulse --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('insights','push_subscriptions','push_notifications');"
```

**If you skip this, the insights / push / receipt tables won't exist in production and every Phase 3 feature (digest, push, receipts) will error.** Migration 0004 is idempotent (guards + additive), so re-running is safe.

## Post-deployment verification

### 8. Observe cron fires

Watch the server logs for all five cron patterns:

```bash
wrangler tail
```

Expected outputs over the next 24 hours:
- `0 2 * * *` (02:00 UTC) → `/api/cron/recur` → `{processed: N}` (recurring entries materialized)
- `0 3 * * *` (03:00 UTC) → `/api/cron/fx` → `{date: "YYYY-MM-DD", count: N}` (FX rates fetched)
- `*/15 * * * *` (every 15 min) → `/api/cron/due-tasks` → `{notified_tasks: N, users_pushed: M}`
- `30 2 * * 1` (02:30 UTC Monday) → `/api/cron/digest` → `{users_processed: N, digests_created: M}`
- `30 14 * * 1` (14:30 UTC Monday) → `/api/cron/digest` → same (Americas catch-up fire)

If any error messages appear (e.g., `[scheduled] unknown cron pattern`, 403 forbidden), check:
- `CRON_SECRET` is set correctly in the environment
- The dispatch map in `src/lib/cron-dispatch.ts` includes all five patterns
- No typos in the cron expression strings in `wrangler.toml`

### 9. Test due-task push locally (optional)

To verify push wiring without waiting for a real due task:

1. Open Pulse in your browser (https://pulse.sdsheikahamed.workers.dev)
2. Enable notifications (prefs → Notifications → toggle)
3. Create a task with due_at = now (or past for immediate trigger)
4. Confirm the task creation
5. Wait ≤15 min for the `*/15 * * * *` cron to fire
6. A push notification should appear ("Task due: <title>")

If no push appears:
- Check browser console for errors (SW registration, fetch failures)
- Verify `VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY` are both set
- Check Cloudflare tail for `/api/cron/due-tasks` success and `/api/push/pending` calls
- Ensure the task was saved (check Pulse's money/task list)

### 10. Test digest push on Monday morning (optional)

On a Monday (in your local timezone):
1. Create a few money entries with amounts in the current week
2. Create a couple tasks in the current week
3. Wait for the digest cron to fire (Monday 08:00 IST = Sunday 02:30 UTC)
4. Check Pulse for the DigestCard (Money tab, top of list)
5. A push notification may arrive ("Your week in review")

If the card doesn't appear after cron fires:
- Check Cloudflare tail for `/api/cron/digest` status
- Verify `isLocalMonday()` logic for your timezone (check logs or manually compute)
- Check D1 `insights` table for a new row (via `wrangler d1 shell pulse`)

## iOS installation & notification setup

### 11. Install Pulse to home screen (iOS)

1. Open Pulse in Safari on iOS
2. Tap Share → Add to Home Screen
3. Name it "Pulse" and confirm

The app is now a PWA capable of receiving push notifications.

### 12. Enable push notifications in the app

1. Open the home-screen Pulse icon
2. Navigate to Settings → Preferences
3. Scroll to "Notifications" section
4. Tap the toggle to enable
5. Safari will prompt "Allow notifications?" — tap Allow

Once enabled, Pulse can receive push notifications from the cron handlers.

### 13. Test push on iOS (optional)

Create a task with a due date and wait for the next `*/15` cron fire. A notification should appear on the home screen even if Pulse is not open (the service worker pulls and displays it).

## Manual 10-receipt vision eval

### 14. Collect 10 test receipts

Gather 10 real receipt photos (JPEGs or PNGs):
- 5 from local vendors (if in India, chai shops, groceries, etc.)
- 3 from online orders (if available; otherwise more local)
- 2 edge cases (blurry, small font, unusual layout)

### 15. Eval sheet setup

Create a local eval tracking spreadsheet or text file:

```
Receipt # | Merchant | Amount | Currency | Category Match | Pass/Fail | Notes
1         | Chai Café | 100 | INR | Dining | ✓ | Clear photo, good extraction
2         | ...
...
10        | ...
```

### 16. Process each receipt

1. In the Pulse app, tap the 📷 button
2. Take/select the receipt photo
3. Wait for SSE events (uploading → parsing → payload)
4. Review the extracted chip (amount, currency, category)
5. Note result in eval sheet
6. Do NOT confirm (discard the chip to avoid populating test data)

Target: ≥8/10 receipts extracted correctly (amount + currency + category reasonable guess).

If <8/10, file a bug against T31 (receipt-agent) and evaluate the failing cases for patterns (e.g., specific layouts, languages, image quality).

## Secrets & environment checklist

- [ ] GROQ_API_KEY set in Cloudflare Workers (from Phase 1/2 setup)
- [ ] CRON_SECRET set in Cloudflare Workers (verified in wrangler secret list)
- [ ] VAPID_PRIVATE_KEY set in Cloudflare Workers (new, set in step 2)
- [ ] NEXT_PUBLIC_VAPID_PUBLIC_KEY set as GitHub Actions variable (step 4)
- [ ] wrangler.toml [vars] VAPID_PUBLIC_KEY matches the GitHub Actions variable (step 3)
- [ ] No test/dev secrets committed to the repo

## Rollback plan (if critical issue found)

If Phase 3 introduces a critical production bug:

1. Revert to the last known-good commit (Phase 2):
   ```bash
   git revert HEAD
   git push origin main
   ```
2. CI will redeploy with the reverted code
3. Investigate the issue on a branch
4. Once fixed, merge the fix and redeploy

(Phase 3 is backward-compatible: existing entries/tasks are unaffected; new tables are unused until features are toggled on.)

## Success handoff

Once the post-deployment verification passes (cron fires, digest renders, push arrives), the retro checklist in `docs/superpowers/notes/phase-3-retro.md` can be marked live. Schedule a 7-day observation period before closing the retro (monitor Cloudflare tail, test features end-to-end, note any UX issues).
