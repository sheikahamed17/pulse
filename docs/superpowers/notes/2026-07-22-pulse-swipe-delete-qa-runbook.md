# Swipe-to-delete — QA Runbook (on-device)

Verify on the iPhone PWA (and once in a desktop browser with a mouse-drag).

**Per list — Money, Tasks (parent + sub-task), Learn, Notes:**
1. Swipe a row left → a red Delete button reveals and the row snaps open at ~88px.
2. Tap the revealed Delete → the row is deleted (Money also shows its Undo toast).
3. Swipe left a little then release before halfway → the row snaps back closed (no delete).
4. With one row open, swipe/open another → the first snaps closed (one open at a time).
5. Tap the body of an open row → it closes and does NOT trigger the row's action (Task: does not toggle complete; Money: does not open receipt/FX).
6. Scroll the list vertically over rows → the page scrolls normally; no row reveals Delete (vertical never hijacked).

**Regressions to confirm still work:**
7. Long-press a row (hold ~0.5s, no move) → the existing menu still opens (Delete / Cancel; Money also "Edit recurring rule").
8. Keyboard: Tab to a row, press Enter → the menu opens; Tab to its Delete, Enter → deletes.
9. Money's always-visible "Delete" button still deletes with Undo.
10. Task: completing a leaf task, sub-task add, and parent auto-complete all still work; swiping a parent deletes it and cascades its sub-tasks.
11. Reduced motion (iOS: Settings → Accessibility → Motion → Reduce Motion): the row jumps open/closed with no slide animation.
