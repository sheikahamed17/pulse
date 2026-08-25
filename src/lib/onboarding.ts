export type OnboardingCounts = {
  entries: number
  accounts: number
  budgets: number
  recurring: number
  habits: number
  pushSubscribed: boolean
}

export type OnboardingStep = {
  id: string
  label: string
  why: string
  href: string
  done: boolean
}

export function onboardingSteps(c: OnboardingCounts): OnboardingStep[] {
  return [
    {
      id: 'entry',
      label: 'Log your first entry',
      why: 'Capture money, tasks, learning or notes',
      href: '/app',
      done: c.entries > 0,
    },
    {
      id: 'accounts',
      label: 'Set up your accounts',
      why: 'Unlocks net worth, forecast, goals & transfers',
      href: '/settings/accounts',
      done: c.accounts > 0,
    },
    {
      id: 'budget',
      label: 'Set a budget',
      why: 'Get overspend alerts',
      href: '/app?tab=money',
      done: c.budgets > 0,
    },
    {
      id: 'recurring',
      label: 'Add a recurring bill',
      why: 'Powers your cash-flow forecast + reminders',
      href: '/settings/recurring',
      done: c.recurring > 0,
    },
    {
      id: 'push',
      label: 'Enable notifications',
      why: 'Budget & bill reminders',
      href: '/settings/preferences',
      done: c.pushSubscribed,
    },
    {
      id: 'habit',
      label: 'Track a habit',
      why: 'Build daily streaks',
      href: '/habits',
      done: c.habits > 0,
    },
  ]
}

export function allStepsDone(steps: OnboardingStep[]): boolean {
  return steps.every(s => s.done)
}
