'use client'

import { useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AuroraBackground } from '@/components/aurora-background'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showEmail, setShowEmail] = useState(false)

  async function handlePasskey() {
    setState('sending'); setErrorMsg('')
    try {
      const res = await authClient.signIn.passkey()
      if (res?.error) {
        setErrorMsg('No passkey found on this device. Use email to sign in, then add a passkey in Settings → Security.')
        setState('error')
        return
      }
      window.location.href = '/app'
    } catch {
      setErrorMsg('Passkey sign-in was cancelled or is unsupported here. Try email instead.')
      setState('error')
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setState('sending'); setErrorMsg('')
    try {
      await authClient.signIn.magicLink({ email, callbackURL: '/app' })
      setState('sent')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sign in to Pulse</CardTitle>
          </CardHeader>
          <CardContent>
            {state === 'sent' ? (
              <p className="text-sm text-muted-foreground">Magic link sent. Check your inbox.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Button onClick={handlePasskey} disabled={state === 'sending'} className="w-full">
                  <Fingerprint className="size-4" aria-hidden />
                  {state === 'sending' ? 'Signing in…' : 'Sign in with Face ID'}
                </Button>

                {!showEmail ? (
                  <button
                    type="button"
                    onClick={() => setShowEmail(true)}
                    className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                  >
                    Email me a link instead
                  </button>
                ) : (
                  <form onSubmit={handleEmail} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" required value={email}
                        onChange={e => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <Button type="submit" variant="secondary" disabled={state === 'sending'}>
                      {state === 'sending' ? 'Sending…' : 'Send magic link'}
                    </Button>
                  </form>
                )}

                {errorMsg && <p role="alert" className="text-sm text-destructive">{errorMsg}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  )
}
