# Push Verify — QA Runbook

1. Settings → Notifications must show "✓ Notifications enabled" (subscribe first if not).
2. Tap "Send test notification" → within a few seconds a "Pulse test 🔔" notification appears on the device; the inline text reads "Sent to N device(s)…".
3. Tapping the notification opens /app.
4. If it says "No subscribed devices" while enabled, or "Couldn't deliver…", the subscription is stale — disable + re-enable, then retest.
5. This proves the same delivery path the weekly digest / due-task / budget alerts use.
