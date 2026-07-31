# Email Auto-Ingest — QA Runbook (on-device)

## One-time setup
1. Pulse → Settings → Auto-import transactions → Generate token → copy it (shown once).
2. Gmail → create a filter matching your bank's transaction emails → apply label "Pulse".
3. script.google.com → New project → paste the Apps Script (shown in Settings or docs/superpowers/notes/pulse-email-ingest.gs).
4. Project Settings → Script properties → ENDPOINT = the endpoint from Settings, TOKEN = your token.
5. Run ingestPulseEmails once → authorize (your own script; click through the "unverified app" screen).
6. Triggers → add time-driven trigger on ingestPulseEmails, every 10 minutes.

## Verify
7. Trigger a real bank transaction (or forward a past bank email into the "Pulse" label).
8. Within ~10 min the Money tab shows a new entry tagged "📧 Email" with amount/direction (category empty).
9. Wrong category → Edit; wrong/duplicate → swipe-delete (Undo restores).
10. Re-run the trigger with the same email → NO duplicate (server dedup on the email text).
11. A promo/statement email that slips the filter → no entry (parser skips non-transactions), thread still relabeled Pulse/Done.
12. Regenerate the token in Settings → update TOKEN in Script properties (old token → 403).

## Notes
- No migration/cron/dep: 'email' is a code-only addition to the money source enum; the endpoint reuses the SMS ingest pipeline with source:"email".
- Bodies are clipped to 4000 chars before parsing (transaction summary sits near the top of bank emails).
- A bank email showing both a transaction amount and an available balance relies on the agent picking the transaction amount — same parse risk as SMS; wrong entries are editable/deletable.
