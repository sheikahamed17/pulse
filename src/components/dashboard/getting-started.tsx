'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAccounts } from '@/hooks/use-accounts'
import { useBudgets } from '@/hooks/use-budgets'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useHabits } from '@/hooks/use-habits'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { onboardingSteps, allStepsDone } from '@/lib/onboarding'

type Props = { userId: string }

export function GettingStarted({ userId }: Props) {
  const entries = useMoneyEntries(userId)
  const accounts = useAccounts(userId)
  const budgets = useBudgets(userId)
  const recurring = useRecurringRules(userId)
  const habits = useHabits(userId)
  const { status: pushStatus } = usePushSubscription()

  const [dismissed, setDismissed] = useState(() => {
    // Lazy initializer: safe for SSR, reads localStorage on mount
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pulse.onboardingDismissed') === '1'
    }
    return false
  })

  const pushSubscribed = pushStatus === 'subscribed'

  const steps = useMemo(
    () =>
      onboardingSteps({
        entries: entries.length,
        accounts: accounts.length,
        budgets: budgets.length,
        recurring: recurring.length,
        habits: habits.length,
        pushSubscribed,
      }),
    [entries.length, accounts.length, budgets.length, recurring.length, habits.length, pushSubscribed],
  )

  if (allStepsDone(steps) || dismissed) {
    return null
  }

  const doneCount = steps.filter(s => s.done).length

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pulse.onboardingDismissed', '1')
  }

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Get started</h2>
        <span className="text-xs text-muted-foreground">
          {doneCount}/{steps.length}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map(step => (
          <li key={step.id}>
            {step.done ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground line-through">
                <Check className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{step.label}</span>
              </div>
            ) : (
              <Link
                href={step.href}
                className="flex flex-col gap-0.5 text-sm text-foreground hover:text-accent-1 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded px-1 py-1 min-h-[44px] justify-center"
                aria-label={step.label}
              >
                <div>{step.label}</div>
                <div className="text-xs text-muted-foreground">{step.why}</div>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleDismiss}
        className="text-xs text-muted-foreground hover:text-foreground transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded px-1 py-1 min-h-[44px] flex items-center"
        aria-label="Dismiss getting started guide"
      >
        Dismiss
      </button>
    </div>
  )
}
