import { describe, it, expect } from 'vitest'
import { onboardingSteps, allStepsDone, type OnboardingCounts } from './onboarding'

describe('onboardingSteps', () => {
  it('returns 6 steps with all done:false when all counts are zero', () => {
    const counts: OnboardingCounts = {
      entries: 0,
      accounts: 0,
      budgets: 0,
      recurring: 0,
      habits: 0,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    expect(steps).toHaveLength(6)
    expect(steps.every(s => s.done === false)).toBe(true)
    expect(allStepsDone(steps)).toBe(false)
  })

  it('returns all steps with done:true when all counts are > 0 and pushSubscribed is true', () => {
    const counts: OnboardingCounts = {
      entries: 1,
      accounts: 1,
      budgets: 1,
      recurring: 1,
      habits: 1,
      pushSubscribed: true,
    }
    const steps = onboardingSteps(counts)
    expect(steps).toHaveLength(6)
    expect(steps.every(s => s.done === true)).toBe(true)
    expect(allStepsDone(steps)).toBe(true)
  })

  it('returns steps with correct done state for partial counts', () => {
    const counts: OnboardingCounts = {
      entries: 5,
      accounts: 0,
      budgets: 3,
      recurring: 0,
      habits: 2,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))
    expect(stepMap.entry.done).toBe(true)
    expect(stepMap.accounts.done).toBe(false)
    expect(stepMap.budget.done).toBe(true)
    expect(stepMap.recurring.done).toBe(false)
    expect(stepMap.push.done).toBe(false)
    expect(stepMap.habit.done).toBe(true)
    expect(allStepsDone(steps)).toBe(false)
  })

  it('returns steps in correct order with stable ids', () => {
    const counts: OnboardingCounts = {
      entries: 0,
      accounts: 0,
      budgets: 0,
      recurring: 0,
      habits: 0,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    expect(steps[0].id).toBe('entry')
    expect(steps[1].id).toBe('accounts')
    expect(steps[2].id).toBe('budget')
    expect(steps[3].id).toBe('recurring')
    expect(steps[4].id).toBe('push')
    expect(steps[5].id).toBe('habit')
  })

  it('returns steps with correct labels', () => {
    const counts: OnboardingCounts = {
      entries: 0,
      accounts: 0,
      budgets: 0,
      recurring: 0,
      habits: 0,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))
    expect(stepMap.entry.label).toBe('Log your first entry')
    expect(stepMap.accounts.label).toBe('Set up your accounts')
    expect(stepMap.budget.label).toBe('Set a budget')
    expect(stepMap.recurring.label).toBe('Add a recurring bill')
    expect(stepMap.push.label).toBe('Enable notifications')
    expect(stepMap.habit.label).toBe('Track a habit')
  })

  it('returns steps with correct why text', () => {
    const counts: OnboardingCounts = {
      entries: 0,
      accounts: 0,
      budgets: 0,
      recurring: 0,
      habits: 0,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))
    expect(stepMap.entry.why).toBe('Capture money, tasks, learning or notes')
    expect(stepMap.accounts.why).toBe('Unlocks net worth, forecast, goals & transfers')
    expect(stepMap.budget.why).toBe('Get overspend alerts')
    expect(stepMap.recurring.why).toBe('Powers your cash-flow forecast + reminders')
    expect(stepMap.push.why).toBe('Budget & bill reminders')
    expect(stepMap.habit.why).toBe('Build daily streaks')
  })

  it('returns steps with correct hrefs', () => {
    const counts: OnboardingCounts = {
      entries: 0,
      accounts: 0,
      budgets: 0,
      recurring: 0,
      habits: 0,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))
    expect(stepMap.entry.href).toBe('/app')
    expect(stepMap.accounts.href).toBe('/settings/accounts')
    expect(stepMap.budget.href).toBe('/app?tab=money')
    expect(stepMap.recurring.href).toBe('/settings/recurring')
    expect(stepMap.push.href).toBe('/settings/preferences')
    expect(stepMap.habit.href).toBe('/habits')
  })

  it('computes done based on count > 0 for all steps except push', () => {
    const counts: OnboardingCounts = {
      entries: 1,
      accounts: 1,
      budgets: 1,
      recurring: 1,
      habits: 1,
      pushSubscribed: false,
    }
    const steps = onboardingSteps(counts)
    const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))
    expect(stepMap.entry.done).toBe(true)
    expect(stepMap.accounts.done).toBe(true)
    expect(stepMap.budget.done).toBe(true)
    expect(stepMap.recurring.done).toBe(true)
    expect(stepMap.push.done).toBe(false)
    expect(stepMap.habit.done).toBe(true)
  })

  it('computes done based on pushSubscribed for push step', () => {
    const counts: OnboardingCounts = {
      entries: 0,
      accounts: 0,
      budgets: 0,
      recurring: 0,
      habits: 0,
      pushSubscribed: true,
    }
    const steps = onboardingSteps(counts)
    const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))
    expect(stepMap.push.done).toBe(true)
  })
})

describe('allStepsDone', () => {
  it('returns true when all steps are done', () => {
    const steps = [
      { id: 'entry', label: 'Log your first entry', why: 'Capture money, tasks, learning or notes', href: '/app', done: true },
      { id: 'accounts', label: 'Set up your accounts', why: 'Unlocks net worth, forecast, goals & transfers', href: '/settings/accounts', done: true },
      { id: 'budget', label: 'Set a budget', why: 'Get overspend alerts', href: '/app?tab=money', done: true },
      { id: 'recurring', label: 'Add a recurring bill', why: 'Powers your cash-flow forecast + reminders', href: '/settings/recurring', done: true },
      { id: 'push', label: 'Enable notifications', why: 'Budget & bill reminders', href: '/settings/preferences', done: true },
      { id: 'habit', label: 'Track a habit', why: 'Build daily streaks', href: '/habits', done: true },
    ]
    expect(allStepsDone(steps)).toBe(true)
  })

  it('returns false when at least one step is not done', () => {
    const steps = [
      { id: 'entry', label: 'Log your first entry', why: 'Capture money, tasks, learning or notes', href: '/app', done: true },
      { id: 'accounts', label: 'Set up your accounts', why: 'Unlocks net worth, forecast, goals & transfers', href: '/settings/accounts', done: false },
      { id: 'budget', label: 'Set a budget', why: 'Get overspend alerts', href: '/app?tab=money', done: true },
      { id: 'recurring', label: 'Add a recurring bill', why: 'Powers your cash-flow forecast + reminders', href: '/settings/recurring', done: true },
      { id: 'push', label: 'Enable notifications', why: 'Budget & bill reminders', href: '/settings/preferences', done: true },
      { id: 'habit', label: 'Track a habit', why: 'Build daily streaks', href: '/habits', done: true },
    ]
    expect(allStepsDone(steps)).toBe(false)
  })

  it('returns false when all steps are not done', () => {
    const steps = [
      { id: 'entry', label: 'Log your first entry', why: 'Capture money, tasks, learning or notes', href: '/app', done: false },
      { id: 'accounts', label: 'Set up your accounts', why: 'Unlocks net worth, forecast, goals & transfers', href: '/settings/accounts', done: false },
      { id: 'budget', label: 'Set a budget', why: 'Get overspend alerts', href: '/app?tab=money', done: false },
      { id: 'recurring', label: 'Add a recurring bill', why: 'Powers your cash-flow forecast + reminders', href: '/settings/recurring', done: false },
      { id: 'push', label: 'Enable notifications', why: 'Budget & bill reminders', href: '/settings/preferences', done: false },
      { id: 'habit', label: 'Track a habit', why: 'Build daily streaks', href: '/habits', done: false },
    ]
    expect(allStepsDone(steps)).toBe(false)
  })

  it('returns true for empty array', () => {
    expect(allStepsDone([])).toBe(true)
  })
})
