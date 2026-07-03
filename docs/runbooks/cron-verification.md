# Cron Verification Runbook

After deploying Phase 3.0, verify all five cron patterns are firing and reaching the application.

## Observability via wrangler tail

**Prerequisites:** Cloudflare API token with Workers:View permission.

### Run the tail command

```sh
wrangler tail --env production
```

(Adjust `--env` if your deployment uses a different environment name. Omit if using the default.)

### Expected logs over a 24-hour cycle

Each pattern fires at its scheduled time (UTC) and logs a success line in the format:
```
[scheduled] <pattern> → <route> 200
```

#### Pattern 1: Recurring entries materializer
- **Cron:** `0 2 * * *` (02:00 UTC daily)
- **Route:** `/api/cron/recur`
- **Expected log:** `[scheduled] 0 2 * * * → /api/cron/recur 200`
- **Backfill proof:** Check that `money_entries` table contains new rows with `source='recurring'` the day after first successful fire (entries for any `recurring_rules` with `next_due_at ≤ now`).

#### Pattern 2: ECB FX rates fetcher
- **Cron:** `0 3 * * *` (03:00 UTC daily, one hour after recur to avoid overlap)
- **Route:** `/api/cron/fx`
- **Expected log:** `[scheduled] 0 3 * * * → /api/cron/fx 200`
- **Backfill proof:** Check that `fx_rates` table has rows with today's date; verify column `base='EUR'` and `rate` values are numeric.

#### Pattern 3: Due-task notification sweep
- **Cron:** `*/15 * * * *` (every 15 minutes)
- **Route:** `/api/cron/due-tasks`
- **Expected log:** `[scheduled] */15 * * * * → /api/cron/due-tasks 200` (appears up to 96 times per day)
- **Proof:** Create a task with `due_at` in the next 15 minutes; the cron fires and inserts a `push_notifications` row with `id='due-{task_id}-{due_at}'`.

#### Pattern 4 & 5: Monday digest (two fires for global coverage)
- **Crons:** `30 2 * * 1` (02:30 UTC Monday) and `30 14 * * 1` (14:30 UTC Monday)
- **Route:** `/api/cron/digest`
- **Expected logs:**
  - `[scheduled] 30 2 * * 1 → /api/cron/digest 200` (every Monday at 02:30 UTC)
  - `[scheduled] 30 14 * * 1 → /api/cron/digest 200` (every Monday at 14:30 UTC)
- **Proof:** After Monday 02:30 UTC fires, check that `insights` table has one row per user with `starts_at` = prior Monday 00:00 UTC (converted from user's local Monday). Check that `push_notifications` rows are created with `id='digest-{userId}-{weekStartDate}'`.

### Troubleshooting

#### No [scheduled] logs appear
- Verify `CRON_SECRET` is provisioned: `wrangler secret list` should list it.
- Verify `worker.ts` was deployed: check that `main = "worker.ts"` in deployed wrangler.toml and that the build included the custom entry (check deploy logs for "worker entry" or similar).
- Check OpenNext build output: if there are errors bundling the worker entry, you may need to fall back to a standalone dispatcher Worker (documented in Phase 3 plan risk register).

#### Pattern fires but returns 4xx or 5xx
- Check application logs (via function logs or D1 query logs).
- Verify `CRON_SECRET` value matches the `Authorization: Bearer` header in the request. Use `wrangler secret get CRON_SECRET` to verify (note: reading secrets is restricted; if unavailable, re-provision with `wrangler secret put CRON_SECRET <value>`).
- Check bearer token constant-time comparison logic in `src/lib/cron-auth.ts`.

#### First fire is very slow
- Expect some latency on the first cold start; subsequent fires should be faster.
- Check if the application is warmed up by making a manual request to the public URL.

## Recovery from lost CRON_SECRET

If the secret is lost or needs rotation:

1. Generate a new secret: `openssl rand -hex 20` (or use a password manager).
2. Provision it: `wrangler secret put CRON_SECRET` (prompts for value, or use `echo <value> | wrangler secret put CRON_SECRET`).
3. Restart deployments or trigger a redeploy to pick up the new secret.
4. Verify with `wrangler secret list`.
