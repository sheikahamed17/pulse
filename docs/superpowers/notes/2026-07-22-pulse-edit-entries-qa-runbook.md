# Edit Captured Entries — QA Runbook (on-device)

**Per list — Money, Tasks, Learn, Notes:**
1. Long-press a row → menu shows "✏️ Edit" above "🗑 Delete".
2. Tap Edit → the confirmation chip opens pre-filled with the row's current values.
3. The recurring toggle is HIDDEN (money + task); the confirm button reads "Save changes".
4. Change a field (money: amount/category/note; task: title/priority/due/tags/project; learning: text/tags/attribution; note: body/title/tags) → tap Save changes.
5. The chip closes and the list row reflects the change immediately.
6. Reload the app (new SW/session) → the change persisted (synced).

**Regressions:**
7. Normal capture (voice / text / receipt) still creates a NEW entry (does not overwrite).
8. Cancel on an edit chip discards changes and leaves the row unchanged.
9. With a capture chip already open, long-press → Edit does nothing (no clobber).
10. Editing does not create a recurring rule and does not spawn duplicates.
11. Money: editing an entry does not touch its receipt attachment or date.
