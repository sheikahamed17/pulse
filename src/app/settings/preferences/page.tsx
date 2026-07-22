'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { isVoiceAnswersEnabled, setVoiceAnswersEnabled } from '@/lib/speak'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { IANA_TIMEZONES } from '@/lib/iana-timezones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import { Label } from '@/components/ui/label'

export default function PreferencesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs, savePrefs } = useUserPrefs()
  const { status: pushStatus, error: pushError, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushSubscription()
  const [state, setState] = useState({
    primaryCurrency: prefs.primary_currency,
    tz: prefs.tz,
  })
  const [tzQuery, setTzQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [speakAnswers, setSpeakAnswers] = useState(true)
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

  // Initialize speakAnswers from localStorage (avoid SSR mismatch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeakAnswers(isVoiceAnswersEnabled())
  }, [])

  const filteredTzs = tzQuery
    ? IANA_TIMEZONES.filter(z => z.toLowerCase().includes(tzQuery.toLowerCase()))
    : IANA_TIMEZONES.slice(0, 20)

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      await savePrefs({ primary_currency: state.primaryCurrency, tz: state.tz })
      setDirty(false)
    } catch (err) {
      console.error('save prefs', err)
      setSaveError((err as Error).message || 'Could not save preferences. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function detectBrowserTz() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      setState(s => ({ ...s, tz: detected }))
      setDirty(true)
      setSaveError(null)
    } catch {
      /* ignore */
    }
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Preferences</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Primary currency</Label>
          <select
            value={state.primaryCurrency}
            onChange={e => { setState(s => ({ ...s, primaryCurrency: e.target.value })); setDirty(true); setSaveError(null) }}
            className="glass-soft rounded-lg border border-input px-3 py-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Dashboard sums convert non-primary entries via ECB rates (Phase 2.4).
          </p>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Time zone</Label>
          <Input
            value={tzQuery}
            onChange={e => setTzQuery(e.target.value)}
            placeholder="Search timezones…"
          />
          <div role="listbox" aria-label="Time zone" className="glass-soft max-h-48 overflow-y-auto rounded-lg border border-input">
            {filteredTzs.map(z => (
              <button
                key={z}
                type="button"
                role="option"
                aria-selected={state.tz === z}
                onClick={() => { setState(s => ({ ...s, tz: z })); setTzQuery(''); setDirty(true); setSaveError(null) }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none ${
                  state.tz === z ? 'bg-white/15 font-medium' : ''
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
            Current: <code className="font-mono">{state.tz}</code>.
            {' '}
            <button type="button" className="underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={detectBrowserTz}>
              Detect from browser
            </button>
          </p>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Notifications</Label>
          {pushStatus === 'unsupported' && (
            <p className="text-xs text-muted-foreground">
              Web Push is not supported on this device.
            </p>
          )}
          {pushStatus === 'denied' && (
            <p className="text-xs text-rose-500">
              Notifications are blocked in your browser settings. Unblock &quot;Pulse&quot; in notification permissions to enable.
            </p>
          )}
          {pushStatus === 'subscribed' && (
            <button
              type="button"
              onClick={pushUnsubscribe}
              className="glass rounded-lg px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            >
              ✓ Notifications enabled — tap to disable
            </button>
          )}
          {pushStatus === 'unsubscribed' && (
            <>
              <Button onClick={pushSubscribe}>
                Enable notifications
              </Button>
              {pushError && (
                <p role="alert" className="mt-2 text-xs text-rose-500 break-words">{pushError}</p>
              )}
            </>
          )}
          {pushStatus === 'pending' && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-medium">Voice answers</h2>
          <p className="text-xs text-muted-foreground">Read spoken query answers aloud after a voice question.</p>
          <button
            type="button"
            aria-pressed={speakAnswers}
            onClick={() => { const next = !speakAnswers; setSpeakAnswers(next); setVoiceAnswersEnabled(next) }}
            className="glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none w-fit"
          >
            {speakAnswers ? '🔊 Speaking enabled — tap to mute' : '🔇 Muted — tap to enable'}
          </button>
        </section>

        <div className="flex flex-col gap-2">
          {saveError && (
            <p role="alert" className="text-sm text-rose-600">{saveError}</p>
          )}
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
                setSaveError(null)
              }}>Discard</Button>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
