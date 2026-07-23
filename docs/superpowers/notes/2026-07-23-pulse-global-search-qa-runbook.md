# Global Search — QA Runbook (on-device)

1. Tap the 🔍 icon in the header → a full-screen search overlay opens with the field autofocused.
2. Type a term that exists in multiple domains (e.g. "rent") → results appear grouped under Money / Tasks / Learn / Notes, each with an icon + label (+ amount for money).
3. Tap a result → the overlay closes, the app switches to that domain's tab, scrolls the row into view, and the row flashes an accent ring for ~1s.
4. Type gibberish → "No matches for …".
5. Clear the field → results disappear (empty query shows nothing).
6. Escape / tap the dark backdrop / tap ✕ → the overlay closes.
7. Case-insensitivity: "RENT" and "rent" return the same results.
8. A domain with >25 matches shows "More matches — refine your search."
9. Reduced motion: the row shows a static ring instead of the flash animation.

Known limitation: if the destination tab has an active filter/search that hides the matched row, the jump switches tabs but the flash won't fire (the row isn't rendered).
