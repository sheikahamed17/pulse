// Cloudflare caps cron triggers at 5 per Worker (API error code 10072). This map
// MUST stay at ≤5 entries (see the guard test in tests/cron-dispatch.test.ts).
// A single tick can run extra work via CRON_SECONDARY below without consuming a slot.
export const CRON_DISPATCH: Record<string, string> = {
  '0 2 * * *': '/api/cron/recur',
  '0 3 * * *': '/api/cron/fx',
  '*/15 * * * *': '/api/cron/due-tasks',
  '30 2 * * 1': '/api/cron/digest',
  '30 14 * * 1': '/api/cron/digest',
}

// Routes that run IN ADDITION to the primary route for a given tick, so scheduled
// work can be added without a new cron trigger. Budget threshold alerts, bill
// reminders, and the salary reminder ride the daily FX tick (0 3) — FX rates are
// refreshed first, so currency conversion is fresh. 0 3 UTC == 08:30 IST, a good
// morning slot for the last-working-day salary nudge.
export const CRON_SECONDARY: Record<string, string[]> = {
  '0 3 * * *': ['/api/cron/budgets', '/api/cron/bill-reminders', '/api/cron/salary-reminder'],
}

export function resolveCronRoute(cron: string): string | null {
  return CRON_DISPATCH[cron] ?? null
}

export function resolveSecondaryCronRoutes(cron: string): string[] {
  return CRON_SECONDARY[cron] ?? []
}
