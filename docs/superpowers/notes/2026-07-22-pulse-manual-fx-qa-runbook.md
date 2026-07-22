# Manual FX Override — QA Runbook

Prereq: migration 0011 applied to remote D1 (user_prefs.fx_overrides column).

1. Log a spend in AED (a currency ECB doesn't cover). On the Money tab its primary-currency (INR) total shows it as unconverted / missing.
2. Settings → Preferences → Manual exchange rates → add "1 EUR = 3.95 AED" → Save.
3. Back on Money: the AED entry now contributes to the INR total (converted via 3.95).
4. Set an override for a currency ECB DOES cover (e.g. USD) at a wrong value → Save → the total does NOT change (ECB wins; override ignored).
5. Remove the AED override → Save → AED reverts to unconverted.
6. Budgets with an AED entry reflect the override in the spent total + push thresholds (rides the cron).
7. Sync: the override applies on another signed-in device after its prefs refetch.
