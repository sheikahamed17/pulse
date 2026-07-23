# Overdue-Task Re-nudge — QA Runbook (on-device)

Requires notifications enabled + migration 0013 applied to remote D1.

**Re-nudge (needs a task overdue since a prior day + the */15 cron to tick):**
1. Create a task with a due date in the past (yesterday or earlier), leave it open.
2. Within ~15 min a push arrives: "Task overdue: <title>" / "Overdue N days". Tapping opens /app?tab=tasks.
3. It does NOT re-fire again the same day (per-day dedup); the next nudge is the following day.
4. A task due LATER TODAY gets only the "Task due:" notification today — no overdue nudge until tomorrow.

**Mute:**
5. Long-press an overdue task → menu shows "🔕 Stop reminding" → tap → the row shows a 🔕 indicator; no more overdue pushes for it.
6. Long-press it again → "🔔 Resume reminding" → nudges resume the next day.
7. Completing or deleting an overdue task stops its nudges (and Undo of a delete restores it — nudges resume).

**Regressions:**
8. The initial "Task due:" notification still fires once at due time (mute does not suppress it).
9. Budget alerts + weekly digest pushes still work (shared push path unaffected).
