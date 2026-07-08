'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Fingerprint, Trash2, Plus } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'

interface PasskeyRow { id: string; name?: string | null; createdAt?: string | number | null }

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

        {/* PIN section is added in Task 5. */}

        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">← Back to Settings</Link>
      </main>
    </>
  )
}
