'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { verifyPin } from '@/lib/pin-lock'
import { AuroraBackground } from '@/components/aurora-background'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const ok = await verifyPin(pin)
    setBusy(false)
    if (ok) { onUnlock(); return }
    setError('Incorrect PIN.')
    setPin('')
  }

  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-screen items-center justify-center p-4">
        <form onSubmit={submit} className="glass flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl p-6">
          <Lock className="size-8 text-accent-2" aria-hidden />
          <h1 className="text-lg font-semibold">Enter your PIN</h1>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value)}
            aria-label="PIN"
            className="glass-soft w-full rounded-lg px-3 py-2 text-center font-mono text-2xl tracking-[0.4em] outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
          />
          <button
            type="submit"
            disabled={busy || pin.length === 0}
            className="w-full rounded-lg bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] px-4 py-2 font-medium text-background disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </main>
    </>
  )
}
