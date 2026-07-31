# SMS Auto-Ingest — QA Runbook (on-device)

## One-time setup (iPhone)
1. Pulse → Settings → Auto-import from SMS → Generate token → copy it (shown once).
2. iOS Shortcuts app → **+** to create a Shortcut (NOT an Automation). Name it "Add to Pulse".
3. Add action "Get Contents of URL":
   - URL: the endpoint shown in Settings (…/api/ingest/sms)
   - Method: POST · Headers: Authorization = `Bearer <your token>`, Content-Type = application/json
   - Request Body (JSON): { "text": [Shortcut Input] }
   Then in the shortcut's details (ⓘ): turn ON "Show in Share Sheet" and accept Text.
   Use it: in Messages, select the bank SMS text → Share → "Add to Pulse".

## Verify
4. Trigger a real bank transaction (or have someone send a matching test SMS).
5. Within moments the Money tab shows a new entry tagged "💳 SMS" with the amount/direction (category empty).
6. Wrong category → tap Edit and set it; wrong/duplicate → swipe-delete (Undo restores).
7. Send the SAME SMS again → NO duplicate entry (dedup).
8. An OTP / promo SMS that slips your filter → no entry (parser skips non-transactions).
9. Regenerate the token in Settings → the old token stops working (update the Shortcut).

## Notes
- Migration 0014 (user_prefs.sms_ingest_token_hash) must be applied to remote D1 (done 2026-07-31).
- Two genuinely-different transactions with byte-identical SMS text would dedupe to one entry — rare (bank SMS carry unique ref/balance), documented limitation.
