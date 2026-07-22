'use client'

import { useCallback, useEffect, useState } from 'react'

export type UserPrefs = {
  primary_currency: string
  tz: string
  fx_overrides: Record<string, number>
}

const DEFAULTS: UserPrefs = { primary_currency: 'INR', tz: 'Asia/Kolkata', fx_overrides: {} }

// Module-level cache so multiple component instances share state without
// thrashing the network. Re-fetched on app mount (one component's effect
// triggers the fetch; others read from cache once it lands).
let cached: UserPrefs | null = null
let inFlight: Promise<UserPrefs> | null = null
const listeners = new Set<(p: UserPrefs) => void>()

async function fetchPrefs(): Promise<UserPrefs> {
  if (cached) return cached
  if (inFlight) return inFlight
  inFlight = fetch('/api/user-prefs')
    .then(async r => {
      if (!r.ok) return DEFAULTS                                       // 401 / 500 → fall back
      const body = await r.json() as UserPrefs
      cached = { primary_currency: body.primary_currency, tz: body.tz, fx_overrides: body.fx_overrides ?? {} }
      for (const l of listeners) l(cached)
      return cached
    })
    .finally(() => { inFlight = null })
  return inFlight
}

export function useUserPrefs() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(cached)
  const [loading, setLoading] = useState(cached === null)

  useEffect(() => {
    let active = true
    if (!cached) {
      fetchPrefs().then(p => {
        if (active) { setPrefs(p); setLoading(false) }
      })
    }
    const onChange = (p: UserPrefs) => { if (active) setPrefs(p) }
    listeners.add(onChange)
    return () => { active = false; listeners.delete(onChange) }
  }, [])

  const savePrefs = useCallback(async (next: UserPrefs) => {
    const res = await fetch('/api/user-prefs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (!res.ok) throw new Error(`user-prefs PUT ${res.status}`)
    cached = next
    for (const l of listeners) l(next)
  }, [])

  return { prefs: prefs ?? DEFAULTS, savePrefs, loading }
}

export function clearUserPrefsCacheForTests() {
  cached = null
  inFlight = null
  listeners.clear()
}
