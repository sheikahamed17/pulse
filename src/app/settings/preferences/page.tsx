'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { IANA_TIMEZONES } from '@/lib/iana-timezones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function PreferencesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs, savePrefs } = useUserPrefs()
  const [state, setState] = useState({
    primaryCurrency: prefs.primary_currency,
    tz: prefs.tz,
  })
  const [tzQuery, setTzQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const previousPrefsRef = useRef(prefs)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  // Sync local state with prefs when they change (but not while dirty)
  useEffect(() => {
    if (!dirty && (previousPrefsRef.current.primary_currency !== prefs.primary_currency || previousPrefsRef.current.tz !== prefs.tz)) {
      setState({
        primaryCurrency: prefs.primary_currency,
        tz: prefs.tz,
      })
    }
    previousPrefsRef.current = prefs
  }, [dirty, prefs])

  const filteredTzs = tzQuery
    ? IANA_TIMEZONES.filter(z => z.toLowerCase().includes(tzQuery.toLowerCase()))
    : IANA_TIMEZONES.slice(0, 20)

  async function save() {
    setBusy(true)
    try {
      await savePrefs({ primary_currency: state.primaryCurrency, tz: state.tz })
      setDirty(false)
    } catch (err) {
      console.error('save prefs', err)
    } finally {
      setBusy(false)
    }
  }

  function detectBrowserTz() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      setState(s => ({ ...s, tz: detected }))
      setDirty(true)
    } catch {
      /* ignore */
    }
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Preferences</h1>
        <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
      </header>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Primary currency</label>
        <select
          value={state.primaryCurrency}
          onChange={e => { setState(s => ({ ...s, primaryCurrency: e.target.value })); setDirty(true) }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {SUPPORTED_CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Dashboard sums convert non-primary entries via ECB rates (Phase 2.4).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Time zone</label>
        <Input
          value={tzQuery}
          onChange={e => setTzQuery(e.target.value)}
          placeholder="Search timezones…"
        />
        <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
          {filteredTzs.map(z => (
            <button
              key={z}
              type="button"
              onClick={() => { setState(s => ({ ...s, tz: z })); setTzQuery(''); setDirty(true) }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-accent ${
                state.tz === z ? 'bg-accent font-medium' : ''
              }`}
            >
              <span>{z}</span>
              {state.tz === z && <span aria-hidden>✓</span>}
            </button>
          ))}
          {filteredTzs.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Current: <code>{state.tz}</code>.
          {' '}
          <button type="button" className="underline" onClick={detectBrowserTz}>
            Detect from browser
          </button>
        </p>
      </section>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => {
            setState({
              primaryCurrency: prefs.primary_currency,
              tz: prefs.tz,
            })
            setDirty(false)
          }}>Discard</Button>
        )}
      </div>
    </main>
  )
}
