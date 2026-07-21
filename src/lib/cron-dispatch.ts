export const CRON_DISPATCH: Record<string, string> = {
  '0 2 * * *': '/api/cron/recur',
  '0 3 * * *': '/api/cron/fx',
  '*/15 * * * *': '/api/cron/due-tasks',
  '30 2 * * 1': '/api/cron/digest',
  '30 14 * * 1': '/api/cron/digest',
  '0 8 * * *': '/api/cron/budgets',
}

export function resolveCronRoute(cron: string): string | null {
  return CRON_DISPATCH[cron] ?? null
}
