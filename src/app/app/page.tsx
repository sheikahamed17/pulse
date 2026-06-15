'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { WidgetForm } from '@/components/widget-form'
import { Button } from '@/components/ui/button'
import { pushPullOnce } from '@/lib/sync-client'

export default function AppPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string, email: string } | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUser({ id: res.data.user.id, email: res.data.user.email })
    })
  }, [router])

  // Background sync every 10 s while app is open
  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync error', err))
    }, 10_000)
    return () => clearInterval(interval)
  }, [user])

  if (!user) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pulse</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => authClient.signOut().then(() => router.replace('/login'))}
        >
          Sign out
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      <WidgetForm userId={user.id} />
    </main>
  )
}
