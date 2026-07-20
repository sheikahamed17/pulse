'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export type Tab = 'money' | 'tasks' | 'learning' | 'notes'

const VALID_TABS: readonly Tab[] = ['money', 'tasks', 'learning', 'notes']

export function useTabState(): [Tab, (t: Tab) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const raw = params.get('tab')
  const active: Tab = (VALID_TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'money'

  const setTab = useCallback((t: Tab) => {
    const next = new URLSearchParams(params.toString())
    if (t === 'money') next.delete('tab')              // default is no param
    else next.set('tab', t)
    const query = next.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [router, pathname, params])

  return [active, setTab]
}
