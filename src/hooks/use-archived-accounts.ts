'use client'
import { useMemo } from 'react'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import type { AccountRow } from '@/lib/dexie'

export function useArchivedAccounts(userId: string | undefined): AccountRow[] {
  const all = useAllAccounts(userId)
  return useMemo(
    () => all
      .filter(a => a.is_archived === 1 && !a.deleted_at)
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
    [all],
  )
}
