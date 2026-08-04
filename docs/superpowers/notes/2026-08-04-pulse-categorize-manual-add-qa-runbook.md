# Categorize-on-ingest + Manual Add — QA Runbook (on-device)

## Categorize + notify on ingest
1. Ensure notifications are enabled (Settings → Preferences → enable; verify with "Send test notification").
2. Trigger a bank email/SMS ingest (or run the Apps Script). A new 📧/💳 entry appears with no category.
3. A push arrives: "💳 ₹<amt> · <merchant> — Tap to set a category".
4. Tap it → app opens the Money tab with that entry's edit chip → pick a category → Save. The row now shows the category.
5. Without tapping the push: the uncategorized auto-fetched row shows a "⚠ Set category" pill → tap → same edit chip.
6. A dedup re-POST or a non-transaction email → NO push (only real new entries notify).

## Manual add
7. On the Money tab, tap "+ Add" → a blank transaction form opens (amount 0, out, no category).
8. Set amount/category/description, tap the 📅 date to back-date, flip in/out → Confirm → the entry is created with source manual on the picked date.
9. On the Tasks/Learn/Notes tabs, "+ Add" opens a blank task/learning/note form respectively.
10. Long-press an existing money entry → Edit → change the 📅 date → Save → the entry's date updates (back-dating on edit).

## Notes
- No migration/cron/dep/new entity_kind — reuses push_notifications + sendPushToUser + the ConfirmationChip.
- Push is best-effort: if the send fails the entry is still created (added:true); the in-app pill is the fallback.
- Date field constructs occurred_at as noon-local on the picked date to avoid a UTC date-boundary shift.
