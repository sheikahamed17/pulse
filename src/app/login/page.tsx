'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setErrorMsg('')
    try {
      await authClient.signIn.magicLink({ email, callbackURL: '/app' })
      setState('sent')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Pulse</CardTitle>
        </CardHeader>
        <CardContent>
          {state === 'sent' ? (
            <p className="text-sm text-muted-foreground">
              Magic link sent. Check your inbox (or the dev console).
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={state === 'sending'}>
                {state === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
