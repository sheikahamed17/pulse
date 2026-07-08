'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Fingerprint, Trash2, Plus, Lock } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { setPin as savePin, clearPin, isPinSet, verifyPin } from '@/lib/pin-lock'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'

interface PasskeyRow { id: string; name?: string | null; createdAt?: string | number | null }

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasPin, setHasPin] = useState(() => typeof window !== 'undefined' ? isPinSet() : false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pinMsg, setPinMsg] = useState('')

  useEffect(() => {
    async function loadPasskeys() {
      const res = await authClient.passkey.listUserPasskeys()
      if (!res.error && res.data) setPasskeys(res.data as unknown as PasskeyRow[])
    }
    loadPasskeys()
  }, [])

  const refresh = useCallback(async () => {
    const res = await authClient.passkey.listUserPasskeys()
    if (!res.error && res.data) setPasskeys(res.data as unknown as PasskeyRow[])
  }, [])

  async function addPasskey() {
    setBusy(true); setError('')
    try {
      const res = await authClient.passkey.addPasskey({ name: 'This device' })
      if (res?.error) setError(res.error.message ?? 'Could not add passkey.')
      await refresh()
    } catch {
      setError('Passkey registration was cancelled or is unsupported on this device.')
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setError('')
    try {
      await authClient.passkey.deletePasskey({ id })
      await refresh()
    } finally { setBusy(false) }
  }

  async function saveNewPin() {
    setPinMsg('')
    if (hasPin && !(await verifyPin(current))) { setPinMsg('Current PIN is incorrect.'); return }
    if (next.length < 4) { setPinMsg('Use at least 4 digits.'); return }
    await savePin(next)
    setHasPin(true); setCurrent(''); setNext(''); setPinMsg('PIN saved.')
  }

  async function removePin() {
    setPinMsg('')
    if (hasPin && !(await verifyPin(current))) { setPinMsg('Current PIN is incorrect.'); return }
    clearPin(); setHasPin(false); setCurrent(''); setNext(''); setPinMsg('PIN removed.')
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Security</h1>

        <section className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <Fingerprint className="size-5 text-accent-2" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Passkeys</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Add this device&apos;s Face ID / fingerprint for one-tap sign-in.
          </p>
          <ul className="mb-3 flex flex-col gap-2">
            {passkeys.length === 0 && (
              <li className="text-sm text-muted-foreground">No passkeys yet.</li>
            )}
            {passkeys.map(pk => (
              <li key={pk.id} className="glass-soft flex items-center justify-between rounded-lg px-3 py-2">
                <span className="text-sm">{pk.name || 'Passkey'}</span>
                <button
                  type="button"
                  onClick={() => remove(pk.id)}
                  disabled={busy}
                  aria-label="Remove passkey"
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button onClick={addPasskey} disabled={busy} className="w-full">
            <Plus className="size-4" aria-hidden /> {busy ? 'Working…' : 'Add passkey'}
          </Button>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </section>

        <section className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="size-5 text-accent-2" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">App PIN</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            {hasPin ? 'A PIN unlocks the app on each open.' : 'Set a PIN to lock the app on each open.'}
          </p>
          <div className="flex flex-col gap-2">
            {hasPin && (
              <input type="password" inputMode="numeric" placeholder="Current PIN" value={current}
                onChange={e => setCurrent(e.target.value)} aria-label="Current PIN"
                className="glass-soft rounded-lg px-3 py-2 font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent-2" />
            )}
            <input type="password" inputMode="numeric" placeholder={hasPin ? 'New PIN' : 'New PIN (4+ digits)'} value={next}
              onChange={e => setNext(e.target.value)} aria-label="New PIN"
              className="glass-soft rounded-lg px-3 py-2 font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent-2" />
            <div className="flex gap-2">
              <Button onClick={saveNewPin} disabled={busy} className="flex-1">{hasPin ? 'Change PIN' : 'Set PIN'}</Button>
              {hasPin && <Button variant="secondary" onClick={removePin} disabled={busy}>Turn off</Button>}
            </div>
            {pinMsg && <p role="alert" className="text-sm text-muted-foreground">{pinMsg}</p>}
          </div>
        </section>

        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">← Back to Settings</Link>
      </main>
    </>
  )
}
