# 2026-07-21 Pulse Insights QA Runbook

Manual deployed-PWA verification for Insights feature end-to-end flow.

## Environment
- Device: Deployed PWA (prod.pulse.so or staging URL)
- Sync: Live D1 + Durable Objects cache
- Auth: Logged-in session required
- Network: Must test both online and after offline sync

---

## Test 1: Open Insights from DigestCard link
**Goal:** Verify navigation from Money tab DigestCard link to `/insights` list.

1. Open PWA to Money tab
2. Locate this week's DigestCard (topmost card, shows "Week in review")
3. Tap DigestCard → should navigate to `/insights`
4. Verify:
   - ✓ Page displays "Insights" header
   - ✓ "Generate / refresh this week" button present + enabled
   - ✓ Page shows list of past weeks newest-first
   - ✓ Aurora background visible

---

## Test 2: Open Insights from Settings nav
**Goal:** Verify Settings navigation link to `/insights`.

1. Tap Settings (gear icon)
2. Look for "Insights" link in nav
3. Tap → should navigate to `/insights`
4. Verify list loads + header displays correctly

---

## Test 3: Insights list sort order
**Goal:** Verify list shows past weeks newest-first.

1. Navigate to `/insights`
2. Examine all cards visible
3. Verify:
   - ✓ Each card shows "Week in review" + date range (start – end)
   - ✓ Top card has most recent end date
   - ✓ Cards descend chronologically

---

## Test 4: Tap insight → detail with category breakdown
**Goal:** Verify detail page displays category breakdown for a past insight.

1. Navigate to `/insights`
2. Tap any insight card (not the top one, pick one with older date)
3. Should navigate to `/insights/{id}` detail page
4. Verify:
   - ✓ Header shows "← All insights" back link
   - ✓ InsightCard displays full variant:
     - Week date range
     - Summary text
     - Metric chips: Spend, Income, Done (if >0), Overdue (if >0, red tone)
     - Category breakdown list below chips (e.g., "Food: ₹5,000", "Transport: ₹2,000")
   - ✓ All values readable (not color-only)

---

## Test 5: Generate this week + appears + persists after reload
**Goal:** Verify on-demand generate works, data syncs, and persists across reload.

**Setup:** 
- Have unsynced transactions this week (add a Money entry if needed)
- Navigate to `/insights`

**Steps:**

1. **Initial state:**
   - Tap "Generate / refresh this week"
   - Button enters loading state (text: "Generating…", disabled)
   - Wait 2–5 sec for backend

2. **After success:**
   - Button returns to enabled state
   - Status message appears: "Updated this week's insight."
   - List updates: new insight for this week should appear at top (or update existing this-week entry)
   - Metric chips show current week's data (Spend, Income, etc.)

3. **Reload the page:**
   - Browser reload (F5 or pull-to-refresh on mobile)
   - Verify insight persists + data unchanged
   - Metric chips still present with same values

4. **Verify sync:**
   - Open another device (if available) logged into same account
   - Navigate to `/insights`
   - Should see the generated insight from step 2
   - Category breakdown matches

---

## Test 6: Generate empty week → "nothing logged" message
**Goal:** Verify graceful handling when no transactions exist this week.

**Setup:**
- Week must have zero Money entries + zero Tasks entries
- Navigate to `/insights`

**Steps:**

1. Tap "Generate / refresh this week"
2. Wait for response
3. Verify:
   - ✓ Status message: "Nothing logged this week yet."
   - ✓ No error toast
   - ✓ Button re-enabled

---

## Test 7: DigestCard atop Money still shows latest within 7 days
**Goal:** Verify DigestCard (top of Money tab) shows the most recent insight (within 7 days), not broken by Insights feature.

**Setup:**
- At least one past insight exists (from earlier tests)
- Generate this week's insight (Test 5)
- Navigate to Money tab

**Steps:**

1. Scroll to top of Money tab
2. Locate DigestCard (should be first thing below header)
3. Verify:
   - ✓ Card displays "Week in review"
   - ✓ Date range is current week (today's week)
   - ✓ Metric chips visible (Spend, Income, etc.)
   - ✓ Summary text present
   - ✓ Tappable link to `/insights` works (Test 1)

---

## Test 8: DigestCard dismiss works
**Goal:** Verify dismiss gesture/button on DigestCard persists across reload.

**Setup:**
- DigestCard visible on Money tab (from Test 7)

**Steps:**

1. Locate DigestCard dismiss affordance (usually swipe or button)
2. Dismiss the card
3. Card disappears from Money tab
4. Reload page (F5)
5. Verify:
   - ✓ Card remains dismissed (not re-shown)
   - ✓ Money tab otherwise normal

6. Tap Settings → clear dismiss state (if UI provides reset)
7. Reload → card re-appears (verifies dismiss is persisted, not just CSS-hidden)

---

## Test 9: Cross-device sync — generate on one, appears on another
**Goal:** Verify real-time multi-device synchronization.

**Setup:**
- Two devices, both logged into same account
- Both have PWA installed + open
- Device A: `/insights` visible
- Device B: Money tab visible

**Steps:**

1. **Device A:** Tap "Generate / refresh this week"
2. **Device A:** Wait for success message + insight appears
3. **Device B:** Wait 1–3 sec, then reload or navigate away/back to `/insights`
4. Verify **Device B:**
   - ✓ New insight appears in list
   - ✓ Data matches Device A
   - ✓ Category breakdown identical

---

## Notes

- **Groq quota:** Generate calls hit Groq API; free tier has daily limit (~100/day). If quota exhausted, message: "Could not generate — try again." Reset at UTC midnight.
- **Offline mode:** Dismiss persists in local Dexie; sync via next push when online.
- **Edge cases:**
  - Multi-currency: Verify symbol (₹, $, ¥, etc.) renders correctly
  - Large metrics: Verify number formatting (e.g., ₹1,00,000 for INR)
  - Missing category: If spend has no top_categories, verify category list hidden gracefully
  - Stale cache: If DigestCard shows old data after generate, hard-refresh (Cmd+Shift+R / Ctrl+Shift+R) to bust CDN
