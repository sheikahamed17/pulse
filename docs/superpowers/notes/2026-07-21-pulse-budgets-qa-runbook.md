# Pulse Budgets — Manual QA Runbook

**Branch:** feature/budgets (Tasks 1-5 complete, Phase 3 live)
**Date:** 2026-07-21

## Pre-flight
- [ ] Branch is deployed to staging/prod (Cloudflare Workers + D1)
- [ ] You have a test Money entry or can quickly log one
- [ ] You have access to browser DevTools (for console requests) or `curl` to trigger cron manually

---

## Test 1: Set a budget via Money tab form

1. Open Money tab on the deployed PWA
2. Scroll to "Budgets" section below the transaction list
3. Click **Add** button (top-right of Budgets section)
4. Select a category from the dropdown (e.g., "Food")
5. Enter a monthly limit (e.g., "5000" if your primary is USD, "500000" if JPY)
6. Click **Save**
7. **Verify:** Budget appears in the list as `Food · $5000/mo` (or equivalent in your currency)
8. Verify the progress bar is visible (should be near 0% initially, `ok` state / green)

---

## Test 2: Set a budget via natural language ("set a budget for food 8000")

1. In the message input bar, type: `set a budget for food 8000` (or replace "food" with a category you want)
2. Press Enter or send
3. **Verify:** A **ConfirmationChipBudget** chip appears showing:
   ```
   Budget · Food · $8000/mo
   [Set] [Cancel]
   ```
4. Click **Set** button
5. **Verify:** The chip disappears, and the budget updates in the Money tab Budgets section (should now show "Food · $8000/mo")
6. Verify the chip buttons both have `aria-label` (inspect with DevTools if needed)
7. Verify both buttons are at least 44px tall (inspect `min-h-[44px]` is applied)

---

## Test 3: Log spend and verify progress bar state transitions (80% → warn, 100% → over)

1. **Set a test budget** (if not already done): Set "Dining" to $100 for this test (or $10000 if JPY)
2. **Log a $50 expense** (50% of limit):
   - Type: `spent 50 on dining`
   - Verify the chip appears, confirm
   - In Budgets section, verify Dining now shows `$50 / $100`
   - Verify progress bar is ~50% filled, **green/ok state**
3. **Log a $30 expense** (now 80% of limit):
   - Type: `spent 30 on dining`
   - Confirm the chip
   - Verify Dining now shows `$80 / $100`
   - Verify progress bar is ~80% filled, **yellow/warn state** (bar color changes)
   - **Critical:** Verify the **text "$80 / $100" is still visible** — color alone does not convey state
4. **Log a $25 expense** (now 105% of limit, over):
   - Type: `spent 25 on dining`
   - Confirm the chip
   - Verify Dining now shows `$105 / $100`
   - Verify progress bar is capped at 100% visually, **red/destructive state** (bar color changes)
   - **Critical:** Verify the **text "$105 / $100" is still visible** — color alone does not convey state
5. **Verify focus-visible ring:** Tab to the remove (trash) button for the Dining budget and verify a ring appears around it

---

## Test 4: Edit and remove a budget

1. In Budgets section, find the budget you just tested (Dining)
2. Click the **trash icon** (remove button) next to it
   - Verify it has `aria-label="Remove budget for Dining"`
3. **Verify:** Budget disappears from the list immediately
4. **Verify:** No error message appears
5. **Optional:** Log another spend on that category (e.g., "spent 20 on dining") and verify it still logs (budget is truly deleted, no reconciliation needed)

---

## Test 5: Verify `log_money` and `query_money` still route correctly (no set_budget misroute)

1. **Normal `log_money`:** Type `spent 25 on groceries` (or another category)
   - Verify the ConfirmationChipMoney appears (not ConfirmationChipBudget)
   - Confirm and verify it creates a Money entry, not a budget
2. **Normal `query_money`:** Type `how much did I spend last week`
   - Verify a natural-language query is routed correctly (you get an answer via query agents, not a budget form)
   - Verify no "set_budget" intent fires
3. **set_budget intent only:** Type `set a budget for utilities 2000`
   - Verify this ONLY creates the ConfirmationChipBudget, not a Money entry
   - Do NOT confirm (click Cancel to avoid creating a real budget)

---

## Test 6: Verify 80%/100% push alerts (after cron runs)

**Prerequisite:** You have a budget at 80% or 100% spent.

### Option A: Manual cron trigger (recommended for immediate test)

1. Open browser DevTools **Console** on any page of the deployed PWA
2. Fetch the cron endpoint with the CRON_SECRET:
   ```javascript
   fetch('/api/cron/budgets', {
     method: 'POST',
     headers: { 'x-cron-secret': 'YOUR_CRON_SECRET_HERE' }
   })
   ```
   (Replace `YOUR_CRON_SECRET_HERE` with the actual secret from your `.env` or deployment config)
3. **Verify** the response is `200` and shows success
4. **Verify on your device:** A push notification arrives within 5 seconds, saying something like:
   - "Budget Alert: Dining is 80% of your monthly limit"
   - "Budget Alert: Dining is over your monthly limit"

### Option B: Wait for daily cron (if deployed with cron trigger)

1. Check your `.wrangler.toml` or deployment settings for the scheduled cron (should be ~midnight UTC or your configured time)
2. Wait for the scheduled time to pass, or manually set the device clock forward if testing locally
3. Verify the same push notification arrives

**Critical verification:**
- Push should arrive **once per threshold (80% and 100%)**. If you see it twice, the deduplication logic may be broken.
- Verify the push notification has **category metadata** or a distinct sound (if your device supports it) so it's distinguishable from other notifications.

---

## Test 7: Verify month rollover re-arms alerts

1. **Set a test budget** (e.g., "Entertainment" to $1000)
2. **Log spend to reach 100%** (log $1000 in that category)
   - Verify progress bar is red/over state
3. **Simulate month rollover:**
   - Manually set your device clock forward to the 1st of next month (or use a test utility if available)
   - Or, trigger the cron manually via `/api/cron/budgets` to recalculate
4. **Verify:**
   - The progress bar **resets to near 0%** for the Entertainment budget (no entries in the new month yet)
   - The progress bar **returns to green/ok state**
5. **Log a new expense in the new month:** Type `spent 500 on entertainment`
   - Verify the bar updates correctly for the new month's totals
6. **Manually trigger cron again** (or wait for daily cron):
   - Verify no push alert fires (because spend is at 50%, below 80% threshold)
   - If it does fire, the re-arming logic is broken

---

## Test 8: Verify focus-visible and touch targets (a11y spot-check)

1. **Focus-visible rings:**
   - Tab through the Budgets section using keyboard
   - Verify every button (Add, Save, Remove/trash, Set, Cancel) displays a **blue/accent-2 ring** when focused
   - Verify form inputs (category select, monthly amount input) also show rings
2. **Touch targets:**
   - Inspect any button with DevTools: right-click → Inspect
   - Verify the button element or its parent has `min-h-[44px]`
   - Visually confirm the button is at least 44×44px (touchable on mobile)
3. **aria-labels:**
   - Inspect each interactive element (buttons, inputs)
   - Verify:
     - "Add budget" button has `aria-label`
     - "Save" button has `aria-label`
     - Remove/trash button has `aria-label`
     - "Set" and "Cancel" buttons (in chip) have `aria-label`
     - Select and input fields have `aria-label`

---

## Known Good Behavior (sanity checks)

- [ ] Creating a Money entry still works (no regression)
- [ ] Querying across Money/Task/Learning/Notes still works
- [ ] Deleting a budget does **not** delete Money entries in that category
- [ ] Month rollover is based on user's timezone (from `prefs.tz`), not UTC
- [ ] Budgets are scoped per user (no cross-user leakage)
- [ ] Budget CRUD operations sync via Dexie/sync-client (check Network tab for push/pull)

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Budget chip doesn't appear after "set a budget for…" | Check router intent matches "set_budget", not "log_money" |
| Progress bar doesn't update after logging spend | Refresh the page; verify Money entry was created in Dexie (F12 → Application → IndexedDB) |
| Push notification doesn't fire at 80%/100% | Verify `CRON_SECRET` matches deployment; check browser push permission is granted; check server logs for cron errors |
| Budget reappears after deletion | Verify deletion is syncing (Network tab, POST to `/api/sync`); check for clock skew in client vs server |
| Old month's budget data shows in new month | Verify `yearMonthInTz()` is using correct timezone; check device clock is correct |
| "Save" button on form is not clickable | Verify `newCatId` is set (select changed) AND `newAmount` is entered; both are required |

---

## Commit & Deploy

- [ ] All QA checks passed
- [ ] No regressions in Money/Task/Learning/Notes flows
- [ ] No console errors or warnings related to budgets
- [ ] Commit: `git commit -m "chore(budgets): a11y pass + QA runbook"`
- [ ] Deploy to prod and re-run critical tests (Test 1, 3, 6) in production
