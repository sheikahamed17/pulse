'use client'

import { Sparkles } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/dexie'
import { currencySymbol } from '@/lib/currency'
import type { DigestMetrics } from '@/lib/digest-aggregate'

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

  let metrics: DigestMetrics | null = null
  try {
    metrics = JSON.parse(row.metrics) as DigestMetrics
  } catch {
    metrics = null
  }

  const symbol = currencySymbol(metrics?.currency ?? 'INR')
  const div = (metrics?.currency ?? 'INR') === 'JPY' ? 1 : 100

  async function dismiss() {
    await db.sync_meta.put({ key: dismissalKey as string, value: new Date().toISOString() })
  }

  return (
    <div className="glass-accent rounded-lg p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-2" />
          <h3 className="text-sm font-semibold">Your week in review</h3>
        </div>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
      <p className="mb-3 text-sm text-foreground">{row.summary}</p>
      {metrics && (
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
            <span className="text-muted-foreground">Spend</span>
            <span className="font-mono font-semibold tabular-nums">{symbol}{(metrics.spend_total / div).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
            <span className="text-muted-foreground">Income</span>
            <span className="font-mono font-semibold tabular-nums">{symbol}{(metrics.income_total / div).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          {metrics.tasks_completed > 0 && (
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              <span className="text-muted-foreground">Done</span>
              <span className="font-mono font-semibold tabular-nums">{metrics.tasks_completed}</span>
            </div>
          )}
          {metrics.tasks_overdue > 0 && (
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              <span className="text-rose-600">Overdue</span>
              <span className="font-mono font-semibold tabular-nums">{metrics.tasks_overdue}</span>
            </div>
          )}
        </div>
      )}
      {metrics?.skipped_currencies && metrics.skipped_currencies.length > 0 && (
        <p className="text-[10px] text-muted-foreground">(Conversions skipped for {metrics.skipped_currencies.join(', ')} — no rates yet)</p>
      )}
    </div>
  )
}
