# Entry UX optimizations — QA Runbook (on-device)

## Quick manual add (amount)
1. On the Money tab, tap "+ Add". The amount field is already focused + empty, number pad up.
2. Type "200" — the Confirm button enables and reads "Confirm ₹200" as you type (no tapping ₹0 / clearing first).
3. Type an amount with a comma ("2,000") — it's parsed correctly (₹2,000, not ₹2).
4. Leave it empty → Confirm stays disabled (can't save a ₹0 entry).
5. A voice/typed capture that parsed an amount still shows the amount as a tap-to-edit value (unchanged).

## Inline categorize
6. An auto-fetched (📧/💳) row with no category shows "⚠ Set category" → tap it → a category picker opens right under the row.
7. Tap a category → it's set instantly (no full edit card, no "Save changes"); the picker closes and the row shows the category.
8. Tap the ingest push notification → the app opens the Money tab and that row's picker opens + scrolls into view.
9. Long-press a row → Edit still opens the full edit card (unchanged).

## Notes
- No migration/cron/dep. parseAmountInput returns minor units (×100), comma-safe; also fixes a latent "2,000"→₹2 edit bug.
- The inline picker renders below the row (outside the swipe-clip) so it isn't cut off.
- Category set uses the same op path as delete (generateOp update → applyLocalOp → pushPull), so it syncs like any edit.
