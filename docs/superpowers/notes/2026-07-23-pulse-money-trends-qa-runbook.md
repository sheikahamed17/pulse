# Money Trends — QA Runbook (on-device)

1. Money tab → MoneyCard shows the this-month total, then a row of 8 weekly bars captioned "Last 8 weeks" (the old 7-day sparkline is gone).
2. The rightmost bar (current week) is accent-colored; earlier weeks are muted; bar heights scale to the tallest week.
3. Weeks with no spend show a thin sliver (not empty/broken).
4. Hover a bar (or long-press) → a native tooltip shows "This week: ₹X" / "N wk ago: ₹Y".
5. Spend in a non-primary currency is included (FX-converted) — a foreign entry raises its week's bar; an unconvertible one is silently omitted (already noted in the FX footnote).
6. Renders correctly in BOTH the desktop right sidebar (~360px) and the mobile money view (full width).
7. Income (money in) does not affect the bars (spend only).
