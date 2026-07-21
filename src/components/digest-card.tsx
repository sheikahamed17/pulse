'use client'

import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/dexie'
import { InsightCard } from '@/components/insight-card'

export function DigestCard({ userId }: { userId: string }) {
  // Hook 1: latest insight for this user (compound-index range, newest first)
  const insights = useLiveQuery(
    () => db.insights
      .where('[user_id+starts_at]')
      .between([userId], [userId, '￿'])
      .reverse()
      .limit(1)
      .toArray(),
    [userId],
  )
  const row = insights?.[0]

  // Hook 2: dismissal flag — called UNCONDITIONALLY; no-op query until row.id known
  const dismissalKey = row ? `digest-dismissed-${row.id}` : null
  const dismissal = useLiveQuery(
    () => (dismissalKey ? db.sync_meta.get(dismissalKey) : undefined),
    [dismissalKey],
  )

  // Early returns AFTER all hooks:
  if (!row) return null

  const rowStart = new Date(row.starts_at)
  const now = new Date()
  const withinSevenDays =
    rowStart.getTime() <= now.getTime() &&
    now.getTime() - rowStart.getTime() <= 7 * 24 * 60 * 60 * 1000
  if (!withinSevenDays) return null
  if (dismissal) return null

  async function dismiss() {
    await db.sync_meta.put({ key: dismissalKey as string, value: new Date().toISOString() })
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <button type="button" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded z-10" onClick={dismiss} aria-label="Dismiss">×</button>
        <InsightCard insight={row} variant="card" />
      </div>
      <Link href="/insights" className="inline-flex text-xs text-muted-foreground hover:text-foreground transition-colors">
        See past weeks →
      </Link>
    </div>
  )
}
