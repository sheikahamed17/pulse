'use client'
import { useMemo } from 'react'
import { useAllCategories } from '@/hooks/use-all-categories'
import type { CategoryRow } from '@/lib/dexie'

export function useArchivedCategories(userId: string | undefined): CategoryRow[] {
  const all = useAllCategories(userId)
  return useMemo(
    () => all.filter(c => c.is_archived === 1 && !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order),
    [all],
  )
}
