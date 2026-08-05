# Sync scaling fix — QA Runbook (on-device + prod)

## Sync no longer 503s
1. After deploy, on the app: open the console (desktop) or just use the app — `/api/sync` should return 200 (was 503 "Worker exceeded resource limits" / error 1102).
2. Prod smoke: an unauthenticated `POST /api/sync` returns 400/401 (not 503); an authed sync returns 200 with `{server_hlc, new_ops_from_server, applied_ack}`.
3. Make a change on the device (add an entry) → it appears server-side within a sync cycle (server tables grow).

## Rebuild server data
4. Settings → Rebuild server data → tap. It loops the chunked backfill; shows "Rebuilt N ops ✓" (N ≈ your op count, ~255) or "…with M errors".
5. Verify server-side (owner/query): categories jump from 5 → 14 canonical (incl. Salary), money entries → your full set.
6. Re-running is safe (idempotent) — a second run rebuilds to the same state.

## Notes
- No migration/dep. Reuses idx_op_log_user_hlc. Client sync contract unchanged.
- Per-request work is now O(new ops + delta), so sync scales with history.
- Chunk size default 20 (cap 50) keeps each backfill request under the Worker subrequest limit.
- Sync materialize failures are logged + non-fatal (op_log is the source of truth); a bad op no longer wedges sync — it re-materializes on the next Rebuild.
