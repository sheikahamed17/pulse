'use client'

import { useCallback, useEffect, useState } from 'react'
import { db, type FxRateRow } from '@/lib/dexie'

// Module-level cache shared across hook instances. Re-fetched on mount;
// stale-while-revalidate via the /api/fx/rates Cache-Control header.
let lastFetchKey = ''
let inFlight: Promise<void> | null = null

async function fetchAndCacheRates(targets: string[]): Promise<void> {
  if (targets.length === 0) return
  const key = targets.slice().sort().join(',')
  if (key === lastFetchKey && !inFlight) return         // already fetched this set in this session

  if (inFlight) { await inFlight; return }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)   // last 30 days
    .toISOString().slice(0, 10)

  inFlight = fetch(`/api/fx/rates?since=${since}&targets=${targets.join(',')}`)
    .then(async r => {
      if (!r.ok) return
      const body = await r.json() as { rates: FxRateRow[] }
      // Upsert into Dexie's fx_rates store
      await db.fx_rates.bulkPut(body.rates)
      lastFetchKey = key
    })
    .catch(err => console.warn('fetchAndCacheRates', err))
    .finally(() => { inFlight = null })

  await inFlight
}

export function useFxRates(targets: string[]): {
  rates: FxRateRow[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [rates, setRates] = useState<FxRateRow[]>([])
  const [loading, setLoading] = useState(false)
  const targetKey = targets.join(',')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      await fetchAndCacheRates(targets)
      const all = await db.fx_rates.toArray()
      if (active) {
        setRates(all.filter(r => targets.includes(r.target)))
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  const refresh = useCallback(async () => {
    lastFetchKey = ''               // force re-fetch
    await fetchAndCacheRates(targets)
    const all = await db.fx_rates.toArray()
    setRates(all.filter(r => targets.includes(r.target)))
  }, [targets])

  return { rates, loading, refresh }
}

export function clearFxRatesCacheForTests() {
  lastFetchKey = ''
  inFlight = null
}
