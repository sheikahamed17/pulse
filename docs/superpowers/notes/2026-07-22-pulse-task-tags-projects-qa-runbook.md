# Task Tags + Projects — QA Runbook

Prereq: migration 0010 applied to remote D1 (projects table + tasks.tags/project_id columns).

1. Settings → Projects: add "Money" (blue), "Home" (green). Rename one; change a color; archive one; delete one.
2. Create a task "call bank" → in the chip add tags [finance, urgent] + pick project Money → Confirm. Task shows a Money chip (blue dot) + #finance #urgent.
3. Tasks tab: project filter Money → only Money tasks; tag filter finance → only finance tasks; both → AND.
4. Rename Money → Finance in Settings: the task's chip label updates (it holds project_id, not the name).
5. Delete a project referenced by a task → the task shows no project chip, no crash.
6. Archived projects don't appear in the chip picker but their tasks keep the reference.
7. A recurring task with tags/project → completing it spawns the next instance carrying the same tags + project.
8. Sync: projects + tagged/assigned tasks appear on another signed-in device after sync.
