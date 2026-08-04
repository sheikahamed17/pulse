# Email Auto-Ingest — QA Runbook (on-device)

## One-time setup (no Gmail label or filter needed)
1. Pulse → Settings → Auto-import transactions → Generate token → copy it (shown once).
2. script.google.com → New project → paste the Apps Script (shown in Settings, or docs/superpowers/notes/pulse-email-ingest.gs) over the sample code.
3. Project Settings (gear) → Script properties → add three:
   - ENDPOINT = the endpoint from Settings (…/api/ingest/sms)
   - TOKEN = your token
   - SENDER = your bank's alert address, e.g. alerts@hdfcbank.bank.in (comma-separate multiple banks)
4. Select ingestPulseEmails → Run once → authorize (your own script; click through the "unverified app" screen: Advanced → Go to (unsafe)).
5. Triggers (clock) → Add trigger → ingestPulseEmails, Time-driven, Minutes timer → every 10 minutes.

## Verify
6. Trigger a real bank transaction (or just wait — the script scans the last 2 days of mail from SENDER).
7. Within ~10 min the Money tab shows a new entry tagged "📧 Email" with amount/direction (category empty).
8. Wrong category → Edit; wrong/duplicate → swipe-delete (Undo restores).
9. Re-run the trigger → NO duplicate (script skips threads it already labeled "PulseDone" + server dedup on the email text).
10. A promo/OTP email from the same sender → no entry (parser returns is_transaction:false), thread still marked PulseDone.
11. Regenerate the token in Settings → update TOKEN in Script properties (old token → 403; the script logs "POST failed 403" and does NOT mark the thread done, so it retries after you fix TOKEN).

## Debugging the parser (dry-run)
- POST `{ "text": "<bank email/SMS text>", "source": "email", "dryRun": true }` with `Authorization: Bearer <token>` to the endpoint → returns `{ agentOut, payload }` and writes NO op. Use it to see exactly what the parser extracts for a given bank format.

## Notes
- No migration/cron/dep: 'email' is a code-only addition to the money source enum; the endpoint reuses the SMS ingest pipeline with source:"email".
- The script finds emails by SENDER (Gmail `from:` search) — no user-created label or filter. It auto-creates a "PulseDone" label and uses `-label:PulseDone newer_than:2d` so each email is sent at most once.
- Bodies are clipped to 4000 chars before parsing (transaction summary sits near the top of bank emails).
- On a Groq rate-limit/parse error the endpoint returns a retryable **503** (not 500); the script leaves the thread un-done and retries next tick.
- HDFC auto-payment / e-mandate emails ("has been successfully paid … Amount: INR …") ARE recognized as transactions (parser prompt carries worked HDFC examples).
