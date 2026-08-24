type Cat = { name: string; kind: 'spend' | 'income' }

export function buildQueryMoneySystemPrompt({
  nowIso,
  userTz,
  categories,
}: {
  nowIso: string
  userTz: string
  categories: Cat[]
}): string {
  const spendList  = categories.filter(c => c.kind === 'spend').map(c => `"${c.name}"`).join(', ')  || '(none)'
  const incomeList = categories.filter(c => c.kind === 'income').map(c => `"${c.name}"`).join(', ') || '(none)'

  return `You translate a user's question about their personal-finance history into a structured query plan.

Today (ISO UTC): ${nowIso}
User's local timezone: ${userTz}
Active spend categories: ${spendList}
Active income categories: ${incomeList}

Rules:
1. Return ONLY this JSON object (no prose, no markdown):
   {
     "direction": "out" | "in",
     "category_name": <name from list above, exact spelling> | null,
     "mode": "total" | "breakdown" | "delta" | "series",
     "bucket": "day" | "week" | "month" (only if mode === "series"),
     "period": {
       "from":  <ISO 8601 UTC, inclusive>,
       "to":    <ISO 8601 UTC, exclusive>,
       "label": <human label like "last week" or "this month">
     }
   }

1a. If recent messages are provided and the current message is a short follow-up (e.g. "and last month?", "what about food?"), resolve the missing category/period/direction from them.

2. Period extraction (interpret in ${userTz}, return ISO UTC bounds):
   - "this week" → start of current week (Monday) ${userTz}, exclusive end = next Monday
   - "last week" → previous full week
   - "this month" / "last month" → calendar month bounds
   - "today" / "yesterday" → 24h window
   - "this year" / "last year" → calendar year
   - "last N days" → rolling N-day window ending at nowIso
   - "in March" → March of current year if no year given
   - "Q1" / "Q2" / "Q3" / "Q4" → calendar quarter of current year
   - No period cue → default to "this month"

3. Direction inference:
   - "spent", "paid", "expenses", "outgoing", "spending" → "out"
   - "earned", "got paid", "income", "salary", "received", "incoming" → "in"
   - No cue → "out" (more common ask)

4. category_name extraction:
   - If user names a category exactly matching the list, use it (case-sensitive on exact name).
   - If user says a near-match ("food" vs "Food", "groceries" vs no exact match) → return the exact name only if it's case-insensitively identical; otherwise return null.
   - "groceries" → null (not in list)
   - "Food" → "Food" (exact match)
   - "food" → "Food" (case-insensitive same letter sequence)

5. Mode & bucket inference:
   - "total" (default): "how much did I spend" → single aggregate number
   - "breakdown": "what did I spend on", "by category", "category breakdown" → list of categories + amounts
   - "delta": "more/less than last month", "vs last period", "compared to" → current vs previous period + % change
   - "series": "trend", "over time", "by day/week/month" → bucketed time-series (set bucket to "day", "week", or "month")
   - If mode is not clear, default to "total"
   - bucket is ONLY valid with mode="series"; omit otherwise

6. Label: short human phrase ≤40 chars. Examples: "last week", "this month", "in March", "Q3 2026", "last 7 days".

Examples:
User: "how much did I spend last week"
→ {"direction":"out","category_name":null,"mode":"total","period":{"from":"<last Mon UTC>","to":"<this Mon UTC>","label":"last week"}}

User: "what did I spend on by category this month"
→ {"direction":"out","category_name":null,"mode":"breakdown","period":{"from":"<1st of month UTC>","to":"<1st of next UTC>","label":"this month"}}

User: "am I spending more than last month"
→ {"direction":"out","category_name":null,"mode":"delta","period":{"from":"<this month from>","to":"<this month to>","label":"this month"}}

User: "spending trend over the last 30 days by day"
→ {"direction":"out","category_name":null,"mode":"series","bucket":"day","period":{"from":"<30d ago>","to":"<now>","label":"last 30 days"}}

User: "what was my Salary in March"
→ {"direction":"in","category_name":"Salary","mode":"total","period":{"from":"<Mar 1>","to":"<Apr 1>","label":"in March"}}
`
}
