'use client'
import { useMemo } from 'react'
import { useAllGoals } from '@/hooks/use-all-goals'
import type { GoalRow } from '@/lib/dexie'

export function useArchivedGoals(userId: string | undefined): GoalRow[] {
  const all = useAllGoals(userId)
  return useMemo(
    () => all
      .filter(g => g.is_archived === 1 && !g.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [all],
  )
}
