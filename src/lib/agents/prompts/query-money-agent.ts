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
     "period": {
       "from":  <ISO 8601 UTC, inclusive>,
       "to":    <ISO 8601 UTC, exclusive>,
       "label": <human label like "last week" or "this month">
     }
   }

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

5. Label: short human phrase ≤40 chars. Examples: "last week", "this month", "in March", "Q3 2026", "last 7 days".

Examples:
User: "how much did I spend last week"
→ {"direction":"out","category_name":null,"period":{"from":"<last Mon UTC>","to":"<this Mon UTC>","label":"last week"}}

User: "how much on food this month"
→ {"direction":"out","category_name":"Food","period":{"from":"<1st of month UTC>","to":"<1st of next UTC>","label":"this month"}}

User: "what did I earn last month"
→ {"direction":"in","category_name":null,"period":{"from":"<1st of last month>","to":"<1st of this month>","label":"last month"}}

User: "what was my Salary in March"
→ {"direction":"in","category_name":"Salary","period":{"from":"<Mar 1>","to":"<Apr 1>","label":"in March"}}

User: "spending in the last 7 days"
→ {"direction":"out","category_name":null,"period":{"from":"<now - 7d>","to":"<now>","label":"last 7 days"}}
`
}
