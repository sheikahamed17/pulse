# Undo on Every Delete — QA Runbook (on-device)

**Per list — Money, Tasks, Learn, Notes (via BOTH swipe-delete and the long-press menu):**
1. Delete a row → a toast "Deleted …" with an "Undo" button appears bottom-center.
2. Tap Undo within 5s → the row reappears in the list.
3. Let the toast sit 5s untouched → it disappears and the delete is permanent.
4. Tap × on the toast → it dismisses immediately (delete stays).

**Task-specific (full fidelity):**
5. Delete a PARENT task that has sub-tasks → Undo → the parent AND all its sub-tasks come back.
6. Delete a single SUB-task (that was the last open one, so the parent auto-completed) → Undo → the sub-task returns and the parent re-opens.

**Regressions:**
7. Money's undo still works exactly as before (delete + Undo restores).
8. Only one toast area (bottom-center), not one per tab; deleting on different tabs stacks entries in the same toast.
9. Safe-area: the toast sits above the home indicator (safe-area inset respected).
