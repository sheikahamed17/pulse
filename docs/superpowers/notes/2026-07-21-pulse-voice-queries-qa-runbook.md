# Pulse Voice Queries — QA Runbook (2026-07-21)

Deployed PWA manual checks for the Voice Queries feature (Speech Synthesis integration for query answers).

## Checklist

### 1. Voice Query per Domain — Correct Answer + Spoken Summary

Deploy to prod and test each domain's voice query from Settings > Query or inline voice trigger:

- **Money domain**: Ask "How much did I spend in July?" or "What's my total balance?"
  - Verify: on-screen answer shows correct total/breakdown/delta/series with precise numbers
  - Verify: spoken summary is sensible (e.g., "You spent $X in July" or "Your total is $Y")
  - Verify: audio plays immediately after query completes

- **Task domain**: Ask "How many overdue tasks?" or "What's pending?"
  - Verify: on-screen answer displays count and task list with correct overdue status
  - Verify: spoken summary announces the count (e.g., "You have N overdue tasks")
  - Verify: audio plays without interruption

- **Learning domain**: Ask "What did I learn about machine learning?" or "Show my learning notes on AI"
  - Verify: on-screen answer lists matching notes with dates
  - Verify: spoken summary reads a concise title or first note (e.g., "Found 3 notes on machine learning")
  - Verify: audio plays after results load

- **Notes domain**: Ask "Show notes about productivity" or "What notes have I taken?"
  - Verify: on-screen answer displays matching notes with titles and timestamps
  - Verify: spoken summary reads a title or snippet (e.g., "Found 2 notes about productivity")
  - Verify: audio plays in sync with answer display

### 2. Toggle Off — Answers Display, Silent

In Settings > Preferences, toggle "Voice answers" to OFF (🔇 Muted):

- Verify: toggle reflects muted state immediately
- Ask any voice query
- Verify: on-screen answer displays correctly (numbers, lists, etc. all accurate)
- Verify: **no audio plays** (SpeechSynthesis does not execute)
- Toggle back ON to 🔊 and re-run a query
- Verify: audio resumes speaking

### 3. Log Utterances — Confirmation Chip, No Speech

Ask a voice `log_*` utterance (e.g., "Log a note about Pulse" or "Log 50 pounds in weight"):

- Verify: confirmation chip appears (text-only feedback)
- Verify: **no audio plays** even though speaking is enabled (log utterances bypass speech)
- Verify: entity is created/updated on backend (check Money/Notes/Learning/Task list updates)

### 4. Dismiss Answer Mid-Speech — Speech Stops

During an active query's spoken answer:

- Verify: audio is currently playing
- Tap the dismiss button or close the answer card
- Verify: audio stops immediately
- Verify: no further audio queues

### 5. Device Without SpeechSynthesis — Answer Displays

Test on a device or browser that does not support SpeechSynthesis (e.g., older browser or test environment):

- Verify: the `speak()` function detects missing SpeechSynthesis and returns early (no errors)
- Ask a voice query
- Verify: on-screen answer displays in full
- Verify: no console errors
- Verify: no visual regression (toggle UI still renders in Settings > Preferences)

## Notes

- All spoken summaries use the global `speak()` function from `@/lib/speak`, which respects the localStorage `pulse.voiceAnswers` toggle
- The Settings toggle persists immediately to localStorage (client-only, not part of server-prefs save flow)
- The `speak()` function cancels any in-flight speech before playing new utterances (prevents audio overlap)
- Query agent router intents (9 total) route text correctly; voice queries go to the same agents as text queries
- No new API changes; all query answers and logging flow through existing routes
