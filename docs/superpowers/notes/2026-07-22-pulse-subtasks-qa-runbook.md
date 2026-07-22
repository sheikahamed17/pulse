# Sub-tasks — QA Runbook

Prereq: migration 0012 applied to remote D1 (tasks.parent_id column).

1. Create "Plan trip". Under it, "+ sub-task": book flights / book hotel / pack. Parent shows 0/3.
2. Complete book flights → parent 1/3, still open. Complete hotel + pack → parent auto-completes (moves to Completed).
3. Re-open "pack" → parent re-opens (back to Open, 2/3).
4. Delete "Plan trip" (long-press → Delete) → all three sub-tasks disappear too (cascade).
5. Delete one sub-task → progress recounts; if that leaves the rest all done, the parent auto-completes.
6. Filters: an open parent with mixed children shows in Open with ALL its children; project/tag filters act on the parent; children always render under a shown parent.
7. Sub-tasks show no "+ sub-task" affordance (one level). Sync: sub-tasks appear on another device.
