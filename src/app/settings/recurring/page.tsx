'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useCategories } from '@/hooks/use-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { currencySymbol } from '@/lib/currency'
import { formatLocalDateOnly } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { AuroraBackground } from '@/components/aurora-background'

export default function RecurringSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const rules = useRecurringRules(userId ?? undefined)
  const categories = useCategories(userId ?? undefined)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  async function setActive(id: string, value: 0 | 1) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'recurring', entity_id: id,
      op_type: 'update', payload: { is_active: value },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(console.error)
  }

  async function deleteRule(id: string) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'recurring', entity_id: id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(console.error)
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recurring</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <ul className="glass divide-y divide-white/10 rounded-2xl border border-white/10">
          {rules.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              No recurring rules. Toggle &quot;Make recurring&quot; on any entry to create one.
            </li>
          )}
          {rules.map(r => {
            const cat = r.category_id ? categoryById.get(r.category_id) : undefined
            const major = (r.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
            const sym = currencySymbol(r.currency)
            const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const
            const periodText = `every ${r.interval_count > 1 ? `${r.interval_count} ` : ''}${PERIOD_NOUN[r.period]}${r.interval_count > 1 ? 's' : ''}`
            return (
              <li key={r.id} className="flex flex-col gap-1 p-3">
                <div className="flex items-center justify-between">
                  <span className={`font-mono ${r.direction === 'out' ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {r.direction === 'out' ? '-' : '+'}{sym}{major}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.is_active ? 'bg-emerald-500/30 text-emerald-400' : 'bg-white/10 text-muted-foreground'}`}>
                    {r.is_active ? 'active' : 'paused'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {cat ? `${cat.icon ?? ''} ${cat.name} · ` : ''}{periodText} · next <span className="font-mono">{formatLocalDateOnly(r.next_due_at, prefs.tz)}</span>
                </span>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setActive(r.id, r.is_active ? 0 : 1)}>
                    {r.is_active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}>Delete</Button>
                </div>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
