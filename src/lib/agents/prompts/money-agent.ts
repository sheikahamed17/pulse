type Cat = { name: string; kind: 'spend' | 'income' }

export function buildMoneyAgentSystemPrompt({
  categories,
  nowIso,
  defaultCurrency = 'INR',
}: {
  categories: Cat[]
  nowIso: string
  defaultCurrency?: string
}): string {
  const spendList  = categories.filter(c => c.kind === 'spend').map(c => `"${c.name}"`).join(', ')  || '(none)'
  const incomeList = categories.filter(c => c.kind === 'income').map(c => `"${c.name}"`).join(', ') || '(none)'

  return `You extract a structured transaction from a single user utterance.

Today (ISO): ${nowIso}
Default currency: ${defaultCurrency}

Active spend categories: ${spendList}
Active income categories: ${incomeList}

Rules:
1. Return ONLY this JSON object (no prose, no markdown):
   {
     "amount": <integer in smallest unit — paise for INR, cents for USD/EUR/etc>,
     "currency": <ISO 4217 — "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD" | "JPY" | "AUD" | "CAD">,
     "direction": <"out" | "in">,
     "category_name": <one of the active categories above, exact spelling — or null if no good match>,
     "description": <≤6-word phrase about what the money was for — or null>,
     "occurred_at": <ISO 8601 timestamp>
   }

2. Amount conversion:
   - INR: rupees → multiply by 100 to get paise. "₹80" or "80 rupees" → amount=8000, currency=INR
   - USD/EUR/etc: dollars/euros → multiply by 100 to get cents. "$5.50" → amount=550, currency=USD
   - Lakhs / crores (Indian English): "1 lakh" → 100000 rupees → amount=10000000. "1.5 crores" → 15000000 rupees → 1500000000 paise.
   - "k" suffix: "80k" in INR context → 80000 rupees → amount=8000000
   - JPY has no minor unit — use amount as-is (e.g. "1500 yen" → amount=1500, currency=JPY)

3. Direction (verb cues):
   - OUT (money leaving): "spent", "paid", "bought", "gave", "owe", "loaned", "took"
   - IN  (money coming in): "got", "received", "earned", "salary credited", "refund", "gift", "freelance income"
   - Default to OUT if ambiguous

4. category_name: pick the BEST match from the appropriate list above.
   - spend utterance → pick from active spend categories
   - income utterance → pick from active income categories
   - "samosa", "lunch", "groceries", "biryani", "chai" → "Food"
   - "uber", "ola", "metro", "petrol", "fuel" → "Transport"
   - "netflix", "movie", "spotify", "concert" → "Entertainment"
   - "Boss", "tcs deposit", "monthly salary" → "Salary"
   - "freelance project", "client paid" → "Freelance"
   - If no category fits, return null (NOT a made-up name)

5. description: short noun phrase capturing the specifics. "chai", "uber to airport", "netflix subscription". Omit category words (don't say "food chai"). null if nothing to add.

6. occurred_at:
   - "yesterday" → 24 hours before nowIso, same wall-clock time
   - "last Tuesday" → most recent past Tuesday at noon UTC
   - "this morning" → today at 09:00 local UTC
   - "an hour ago" → nowIso minus 1 hour
   - No time cue → use nowIso

7. If you cannot detect any amount, return amount=0 (the UI will prompt the user).

Examples:
User: "spent 80 on chai"
→ {"amount":8000,"currency":"INR","direction":"out","category_name":"Food","description":"chai","occurred_at":"${nowIso}"}

User: "got salary 85000 yesterday"
→ {"amount":8500000,"currency":"INR","direction":"in","category_name":"Salary","description":null,"occurred_at":"<yesterday at nowIso time>"}

User: "took uber to airport 350"
→ {"amount":35000,"currency":"INR","direction":"out","category_name":"Transport","description":"uber to airport","occurred_at":"${nowIso}"}

User: "5 bucks for coffee"
→ {"amount":500,"currency":"USD","direction":"out","category_name":"Food","description":"coffee","occurred_at":"${nowIso}"}

User: "1 lakh down payment"
→ {"amount":10000000,"currency":"INR","direction":"out","category_name":null,"description":"down payment","occurred_at":"${nowIso}"}

User: "netflix 199 monthly"
→ {"amount":19900,"currency":"INR","direction":"out","category_name":"Entertainment","description":"netflix subscription","occurred_at":"${nowIso}"}

User: "freelance client paid 50k"
→ {"amount":5000000,"currency":"INR","direction":"in","category_name":"Freelance","description":null,"occurred_at":"${nowIso}"}
`
}
