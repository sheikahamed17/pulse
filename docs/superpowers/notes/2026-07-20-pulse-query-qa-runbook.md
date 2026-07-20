# Pulse Query QA Runbook (Task 6)

Manual QA checklist for the read-only query-agents feature deployed to production PWA.

**Date:** 2026-07-20  
**Branch:** `feature/query`  
**Scope:** QueryAnswerCard (money modes), QueryListAnswer wrapper, list answers (task/learning/notes)

---

## QA Environment

- **Device:** Your deployed Pulse PWA (Cloudflare Workers/D1 + React 19)
- **Network:** Test with both online and offline (airplane mode)
- **Browser:** Open DevTools; verify no console errors during query execution
- **Data:** Use existing local data; queries are read-only and execute client-side (Dexie)

---

## Money Query Tests

### Test 1: Total Mode
**Utterance:** `how much on food last week`

**Expected Intent:** `query_money/total`

**Expected Answer:**
- Single large figure (primary currency) with symbol
- Entry count below
- "Show entries" button to expand
- 30s auto-dismiss timer (watch the card fade)
- "Dismiss" button (explicit close)

**Checks:**
- [ ] Figure displays in large, monospace, tabular-nums font
- [ ] Currency symbol correct for your primary currency
- [ ] Entry count is accurate (spot-check against Money tab)
- [ ] "Show entries" button expands a read-only list of matching money entries
- [ ] Each entry shows: category icon + name, description (if any), amount in original currency, conversion button if multi-currency
- [ ] Input bar remains disabled while answer is open
- [ ] Card auto-dismisses after ~30s
- [ ] Dismiss button works
- [ ] Works offline (airplane mode)
- [ ] No console errors

---

### Test 2: Breakdown Mode
**Utterance:** `what did I spend on by category last month`

**Expected Intent:** `query_money/breakdown`

**Expected Answer:**
- Multiple rows (one per category with activity in period)
- Each row: category name, amount in monospace, horizontal bar (visual weight proportional to spend)
- "Show entries" button to expand detailed list
- Auto-dismiss + explicit dismiss

**Checks:**
- [ ] Categories sorted by spend (descending)
- [ ] Amounts are monospace, tabular-nums, correct currency
- [ ] Bars are visually proportional (tallest bar = maximum spend)
- [ ] "Uncategorized" row appears if entries have no category
- [ ] "Show entries" expands the full entry list
- [ ] Input bar disabled
- [ ] Auto-dismiss after 30s
- [ ] Dismiss works
- [ ] Works offline
- [ ] No console errors

---

### Test 3: Delta Mode
**Utterance:** `am I spending more than last month`

**Expected Intent:** `query_money/delta`

**Expected Answer:**
- Two figures: "Current period" (large), "Change" (smaller with ↑/↓ indicator and %)
- Previous period amount below for reference
- "Show entries" button
- Auto-dismiss + explicit dismiss

**Checks:**
- [ ] Current period amount is large, monospace, tabular-nums
- [ ] Change indicator: ↑ (red/destructive) if spending increased, ↓ (green/emerald) if decreased
- [ ] Percentage is accurate
- [ ] If change is 0% (no entries in either period), display handles gracefully
- [ ] "Show entries" lists entries from current period
- [ ] Input bar disabled
- [ ] Auto-dismiss after 30s
- [ ] Dismiss works
- [ ] Works offline
- [ ] No console errors

---

### Test 4: Series Mode (Sparkline)
**Utterance:** `spending trend`

**Expected Intent:** `query_money/series`

**Expected Answer:**
- Sparkline chart (small line with area fill, accent-2 color)
- Bucket count below (e.g., "7 buckets with activity")
- "Show entries" button
- Auto-dismiss + explicit dismiss

**Checks:**
- [ ] Sparkline renders (visible line + gradient fill)
- [ ] Sparkline is labeled for screen readers (role="img", aria-label)
- [ ] Bucket count is accurate (non-zero periods only)
- [ ] "Show entries" lists entries from the period
- [ ] Input bar disabled
- [ ] Auto-dismiss after 30s
- [ ] Dismiss works
- [ ] Works offline
- [ ] No console errors

---

## Task Query Tests

### Test 5: Overdue Tasks
**Utterance:** `what's overdue`

**Expected Intent:** `query_task`

**Expected Answer:**
- Read-only list of overdue tasks
- Each row: circle icon (incomplete) + title, priority badge (if ≠ medium), due date in orange/warning
- Count in header
- "Dismiss" button (no "Show entries" — this list IS the answer)
- Auto-dismiss + explicit dismiss

**Checks:**
- [ ] Only uncompleted tasks with past due_at are shown
- [ ] Circle icon has aria-label "Task overdue"
- [ ] Dates are monospace, tabular-nums, timezone-aware
- [ ] Input bar disabled
- [ ] Auto-dismiss after 30s
- [ ] Dismiss works
- [ ] Works offline
- [ ] No console errors

---

## Learning Query Tests

### Test 6: Learning Search
**Utterance:** `what did I learn about Rust`

**Expected Intent:** `query_learning`

**Expected Answer:**
- Read-only list of learnings matching "Rust"
- Each row: learning text, tags (if any), attribution (if any), date
- Count in header
- Auto-dismiss + explicit dismiss

**Checks:**
- [ ] Search is case-insensitive text match on learning.text
- [ ] Tags display as pills (bg-white/10 border)
- [ ] Attribution is right-aligned in small text
- [ ] Dates are monospace, tabular-nums, timezone-aware
- [ ] Input bar disabled
- [ ] Auto-dismiss after 30s
- [ ] Dismiss works
- [ ] Works offline
- [ ] No console errors

---

## Notes Query Tests

### Test 7: Notes Search
**Utterance:** `find my note about wifi`

**Expected Intent:** `query_notes`

**Expected Answer:**
- Read-only list of notes matching "wifi"
- Each row: title (if any) or first line of body, body snippet (if title exists), tags (if any), date (right-aligned)
- Count in header
- Auto-dismiss + explicit dismiss

**Checks:**
- [ ] Search is case-insensitive text match on note.title or note.body
- [ ] Title displays if present; body displays if no title or as preview below title
- [ ] Tags display as pills
- [ ] Dates are monospace, tabular-nums, right-aligned
- [ ] Input bar disabled
- [ ] Auto-dismiss after 30s
- [ ] Dismiss works
- [ ] Works offline
- [ ] No console errors

---

## Regression Tests (Must Still LOG, Not Query)

### Test 8: Money Log (Regression)
**Utterance:** `spent 80 on chai`

**Expected Intent:** `log_money` (not `query_money`)

**Expected Answer:**
- ConfirmationChip (draft) appears with amount 80, category auto-detected or empty, currency auto-set
- User can confirm or cancel
- On confirm: entry is logged, chip disappears, tab switches to Money, entry appears in MoneyList
- Input bar re-enables immediately

**Checks:**
- [ ] No query card appears
- [ ] Chip allows edit before confirm
- [ ] Money entry is recorded
- [ ] Works offline (logs to Dexie, syncs when online)
- [ ] No console errors

---

### Test 9: Note Log (Regression)
**Utterance:** `note that the wifi password is hunter2`

**Expected Intent:** `log_note` (not `query_notes`)

**Expected Answer:**
- ConfirmationChip with note kind, body auto-filled
- User can confirm or cancel
- On confirm: note is logged, chip disappears, tab switches to Notes (if not already there)

**Checks:**
- [ ] No query card appears
- [ ] Chip shows note kind
- [ ] Note is recorded
- [ ] Works offline
- [ ] No console errors

---

### Test 10: Learning Log (Regression)
**Utterance:** `I learned Rust has ownership`

**Expected Intent:** `log_learning` (not `query_learning`)

**Expected Answer:**
- ConfirmationChip with learning kind, text auto-filled, optional tags
- User can confirm or cancel
- On confirm: learning is logged, chip disappears, tab switches to Learning

**Checks:**
- [ ] No query card appears
- [ ] Chip shows learning kind
- [ ] Learning is recorded
- [ ] Works offline
- [ ] No console errors

---

## Input Bar State

### Test 11: Input Bar Disabled While Query Open
**Steps:**
1. Open any query answer (e.g., Test 1: total mode)
2. Check the input bar: voice recorder, receipt button, text input, and Parse button are all **disabled** (grayed out)
3. Dismiss the answer
4. Verify input bar re-enables

**Checks:**
- [ ] Input bar disabled while any query kind is open (money, task, learning, notes)
- [ ] Voice recorder disabled
- [ ] Receipt button disabled
- [ ] Text input disabled
- [ ] Parse button disabled
- [ ] Input re-enables immediately on dismiss

---

## Accessibility Spot Checks

### Test 12: Keyboard Navigation
**Steps:**
1. Open a query answer (any kind)
2. Press `Tab` to navigate to the Dismiss button
3. Press `Enter` to dismiss
4. Tab through the "Show entries" button (if present)
5. Verify focus ring (cyan 2px border) is visible on all interactive elements

**Checks:**
- [ ] Dismiss button is tab-focusable
- [ ] Show entries button is tab-focusable
- [ ] Focus ring is visible (focus-visible:ring-2 ring-accent-2)
- [ ] Cannot tab into the list itself (read-only, no interactive elements)
- [ ] Dismiss works via Enter key

---

### Test 13: Screen Reader Labels
**Steps:**
1. Open a query answer
2. Enable screen reader (or inspect DevTools: Element > Accessibility panel)
3. Check:
   - Header text describes the query (e.g., "💸 Spent in Food · Last Week")
   - Dismiss button has aria-label (e.g., "Dismiss money answer")
   - Show entries button has aria-label (e.g., "Show entries for money answer")
   - Breakdown bars have aria-label (category + amount)
   - Sparkline has aria-label (e.g., "Spending trend over 7 periods")
   - Task icons have aria-labels (e.g., "Task completed" or "Task overdue")

**Checks:**
- [ ] All buttons have descriptive aria-labels
- [ ] Breakdown bars have role="progressbar" and aria-valuenow/min/max
- [ ] Sparkline has role="img" and aria-label
- [ ] Task status icons have aria-labels
- [ ] Header text is semantically clear (h3 or similar, not just styled)

---

### Test 14: Touch Target Size
**Steps:**
1. Open a query answer on a mobile device
2. Tap the Dismiss button
3. Tap the Show entries button (if present)
4. Verify buttons are comfortable to tap (min 44px)

**Checks:**
- [ ] Dismiss button is at least 44px tall (Pulse: py-2 + padding = ~44px min)
- [ ] Show entries button is at least 44px tall
- [ ] Buttons have comfortable spacing
- [ ] No accidental double-taps needed

---

## Summary

| Test | Scenario | Status |
|------|----------|--------|
| 1 | Money Total | [ ] |
| 2 | Money Breakdown | [ ] |
| 3 | Money Delta | [ ] |
| 4 | Money Series | [ ] |
| 5 | Task Overdue | [ ] |
| 6 | Learning Search | [ ] |
| 7 | Notes Search | [ ] |
| 8 | Money Log (Regression) | [ ] |
| 9 | Note Log (Regression) | [ ] |
| 10 | Learning Log (Regression) | [ ] |
| 11 | Input Bar Disabled | [ ] |
| 12 | Keyboard Navigation | [ ] |
| 13 | Screen Reader Labels | [ ] |
| 14 | Touch Targets | [ ] |

---

## Sign-off

**QA Date:** ________________  
**Tester:** ________________  
**Result:** PASS / FAIL  

**Notes:**
```
[Add any issues found, browser version, device model, network conditions, etc.]
```

---

## Known Limitations

- Queries are read-only; no edit or delete from answer lists (by design)
- Voice query only returns `query_money` (text query routes handle all kinds)
- Saved queries not supported (Phase 4+)
- Cross-domain queries not supported (each query kind is independent)
- Charts beyond sparkline not supported (only money series uses sparkline)
