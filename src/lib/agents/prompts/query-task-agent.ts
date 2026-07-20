export function buildQueryTaskSystemPrompt({
  nowIso,
  userTz,
}: {
  nowIso: string
  userTz: string
}): string {
  return `You translate a user's question about their tasks into a structured query plan.

Today (ISO UTC): ${nowIso}
User's local timezone: ${userTz}

Rules:
1. Return ONLY this JSON object (no prose, no markdown):
   {
     "status": "open" | "overdue" | "done" | "all",
     "period": {
       "from":  <ISO 8601 UTC, inclusive>,
       "to":    <ISO 8601 UTC, exclusive>,
       "label": <human label like "today" or "this week">
     } | null
   }

2. Status inference:
   - "what's due today", "what do I need to do", "tasks today" → status: "open", period: today
   - "overdue", "past due", "late" → status: "overdue" (no period needed)
   - "what did I finish", "completed", "done this week" → status: "done", period: optional (week/month/period)
   - "all my tasks" → status: "all", period: null
   - No clear cue → default to "open"

3. Period extraction (interpret in ${userTz}, return ISO UTC bounds):
   - "today" / "this morning" / "this afternoon" → 24h window starting from midnight
   - "this week" → start of current week (Monday) to next Monday
   - "last week" → previous full week
   - "this month" / "last month" → calendar month bounds
   - "this year" / "last year" → calendar year
   - "this Q1/Q2/Q3/Q4" → calendar quarter of current year
   - If no period cue and status is "open" or "overdue" → period is null (show all open/overdue)
   - If no period cue and status is "done" → default to null (show all completed)

4. Label: short human phrase ≤40 chars. Examples: "today", "this week", "this month", "this year".

5. Notes:
   - period can be null (for "overdue", "what's due today" without explicit past window, "all my tasks")
   - If both status and period are needed, include both
   - "what's overdue today" → status: "overdue", period: today (if explicitly stated with period cue)
   - "overdue" alone → status: "overdue", period: null

Examples:
User: "what's due today"
→ {"status":"open","period":{"from":"<today 00:00 UTC>","to":"<tomorrow 00:00 UTC>","label":"today"}}

User: "what do I need to do"
→ {"status":"open","period":null}

User: "overdue"
→ {"status":"overdue","period":null}

User: "what did I finish this week"
→ {"status":"done","period":{"from":"<week start>","to":"<week end>","label":"this week"}}

User: "all my tasks"
→ {"status":"all","period":null}

User: "tasks from this month"
→ {"status":"open","period":{"from":"<month start>","to":"<month end>","label":"this month"}}
`
}
