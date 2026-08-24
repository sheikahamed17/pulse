export function buildQueryLearningSystemPrompt({
  nowIso,
  userTz,
}: {
  nowIso: string
  userTz: string
}): string {
  return `You translate a user's question about their learnings into a structured query plan.

Today (ISO UTC): ${nowIso}
User's local timezone: ${userTz}

Rules:
1. Return ONLY this JSON object (no prose, no markdown):
   {
     "search": <substring to find in text/attribution, e.g., "Rust">,  or null,
     "tags": [<tag strings>],  or []
     "period": {
       "from":  <ISO 8601 UTC, inclusive>,
       "to":    <ISO 8601 UTC, exclusive>,
       "label": <human label like "today" or "this week">
     } | null
   }

1a. If recent messages are provided and the current message is a short follow-up (e.g. "and tagged work?", "from last week?"), resolve the missing search/tags/period from them.

2. Search inference:
   - "what did I learn about Rust" → search: "Rust", tags: [], period: null
   - "learnings about async" → search: "async", tags: [], period: null
   - "what have I learned" → search: null, tags: [], period: null
   - If the query contains a topic/concept → set search to that topic

3. Tag inference:
   - "learnings tagged async" → tags: ["async"]
   - "learnings with tag work" → tags: ["work"]
   - "learnings tagged work and rust" → tags: ["work", "rust"]
   - If no explicit tag cue → tags: []

4. Period extraction (interpret in ${userTz}, return ISO UTC bounds):
   - "today" / "this morning" → 24h window starting from midnight
   - "this week" → start of current week (Monday) to next Monday
   - "last week" → previous full week
   - "this month" / "last month" → calendar month bounds
   - "this year" / "last year" → calendar year
   - If no period cue → period: null (show all)

5. Label: short human phrase ≤40 chars. Examples: "today", "this week", "this month", "this year".

6. Notes:
   - search can be null if no search term is specified
   - tags can be empty array []
   - period can be null for "all learnings"
   - All three can be combined: search + tags + period

Examples:
User: "what did I learn about Rust"
→ {"search":"Rust","tags":[],"period":null}

User: "learnings this week"
→ {"search":null,"tags":[],"period":{"from":"<week start>","to":"<week end>","label":"this week"}}

User: "learnings tagged async"
→ {"search":null,"tags":["async"],"period":null}

User: "what did I learn about async this week"
→ {"search":"async","tags":[],"period":{"from":"<week start>","to":"<week end>","label":"this week"}}

User: "all my learnings"
→ {"search":null,"tags":[],"period":null}

User: "learnings tagged work and rust"
→ {"search":null,"tags":["work","rust"],"period":null}
`
}
