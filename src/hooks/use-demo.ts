'use client'

import { useEffect, useState } from 'react'

export type DemoState = { demoMode: boolean; resetHours: number | null }

// Module-level cache: the demo flag never changes for a given deployment, so we
// fetch /api/demo/status once and reuse it across every component that gates on
// demo mode (banner, capture examples, disabled Settings, etc.).
let cache: DemoState | null = null

export function useDemo(): DemoState {
  const [state, setState] = useState<DemoState>(cache ?? { demoMode: false, resetHours: null })

  useEffect(() => {
    if (cache) return
    fetch('/api/demo/status')
      .then(r => r.json() as Promise<DemoState>)
      .then(s => { cache = s; setState(s) })
      .catch(() => { /* default (non-demo) on failure — never breaks a real instance */ })
  }, [])

  return state
}
