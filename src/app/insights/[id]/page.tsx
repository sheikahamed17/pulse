'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { InsightCard } from '@/components/insight-card'
import { useInsights } from '@/hooks/use-insights'

export default function InsightDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [userId, setUserId] = useState<string | null>(null)
  const insights = useInsights(userId ?? undefined)
  const insight = insights.find(i => i.id === params.id)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <Link href="/insights" className="text-sm text-muted-foreground hover:underline">← All insights</Link>
        {insight ? <InsightCard insight={insight} variant="detail" /> : <p className="text-sm text-muted-foreground">Insight not found.</p>}
      </main>
    </>
  )
}
