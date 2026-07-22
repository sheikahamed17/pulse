# Recurring Tasks — QA Runbook

Prereq: the D1 migration 0009 columns exist in remote D1 (`recur_period`, `recur_interval` on `tasks`).

1. **Create:** say/type "remind me to water plants" → in the task chip toggle **Repeat after completion** → pick Daily, every 3 → Confirm task. The task appears in Tasks (open) with a **🔁 every 3 days** badge.
2. **Complete → next:** complete it. It moves to Completed (no 🔁), and a NEW open task "Water plants" appears due 3 days from now, badged 🔁 every 3 days.
3. **No pile-up:** only ever one open instance per recurring task.
4. **No double-spawn:** toggle a completed recurring task open then closed again → no extra instance appears.
5. **Stop:** long-press the open recurring task → Delete → it's gone and nothing respawns.
6. **Non-recurring unchanged:** a normal task (Repeat off) completes with no spawn.
7. **Sync:** the spawned instance appears on another signed-in device after sync.

Known limitation (v1): completing the SAME recurring instance on two devices *before they sync* spawns two next instances (a deletable duplicate) — the client-driven model can't dedup concurrent spawns. Single-device use is unaffected. Harden later via a deterministic spawn id or server-side dedup if needed.
