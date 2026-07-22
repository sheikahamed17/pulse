# Drained-Receipt Chip — QA Runbook

On-device manual verification (the page-effect wiring has no unit harness).

1. **Offline capture:** open the app, go offline (DevTools → Network → Offline, or airplane mode). Tap the receipt button, pick a receipt photo. It should show an error/queued state (enqueued to `receipt_queue`) — no chip yet.
2. **Drain surfaces a chip:** go back online (or reload while online). Within a moment the receipt should parse in the background and a **confirmation chip** should auto-appear with the parsed amount/merchant and the receipt image preview (served from `/api/receipt/<key>`).
3. **Confirm:** tap Confirm → a money entry is created (Money tab), tagged `source: receipt`, with the 📎 receipt viewable. The chip does not re-appear on reload (draft row deleted).
4. **Cancel dismisses:** repeat 1-2, then tap Cancel → the chip disappears and does NOT re-appear on reload (draft permanently dismissed; R2 image remains but unreferenced).
5. **Multiple receipts:** queue 2+ offline receipts, go online → chips appear one at a time; confirming/cancelling one pops the next.
6. **No clobber:** while a drained chip is up, the mic/receipt/text inputs are disabled (existing `draft !== null` guard) — no collision.

Known limitation: a discarded receipt's R2 image is not deleted (orphan cleanup out of scope).
