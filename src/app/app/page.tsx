'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

export default function AppPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setEmail(res.data.user.email)
    })
  }, [router])

  if (!email) return <p className="p-8">Loading…</p>

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Pulse</h1>
      <p className="mt-2 text-sm text-muted-foreground">Signed in as {email}</p>
      <p className="mt-8 text-sm">Widget UI lands in Task 20.</p>
    </main>
  )
}
