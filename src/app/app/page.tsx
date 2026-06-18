'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmationChip, type ChipDraft } from '@/components/confirmation-chip'
import { MoneyCard } from '@/components/money-card'
import { MoneyList } from '@/components/money-list'
import { VoiceRecorder } from '@/components/voice-recorder'
import { useCategories } from '@/hooks/use-categories'
import { seedDefaultCategoriesIfEmpty } from '@/lib/seed-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { drainVoiceQueue } from '@/lib/voice-queue'
import { computeNextDue } from '@/lib/recurring'
import type { MoneyPayload } from '@/lib/op-schemas/money'

// Delegate to the same engine the cron uses so the FIRST next_due_at clamps
// day-of-month identically to subsequent fires (Jan 31 + 1mo → Feb 28, not
// Mar 3 which raw setUTCMonth would produce).
function nextDueFromAnchor(anchorIso: string, period: 'daily'|'weekly'|'monthly'|'yearly', n: number): string {
  return computeNextDue({
    id: 'tmp',
    period,
    interval_count: n,
    anchor_at: anchorIso,
    next_due_at: anchorIso,
    occurrences_so_far: 0,
    end_condition_kind: 'never',
    end_until: null,
    end_count: null,
    is_active: 1,
  })
}

export default function AppPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<ChipDraft | null>(null)
  const [parsing, setParsing] = useState(false)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUser({ id: res.data.user.id, email: res.data.user.email })
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    seedDefaultCategoriesIfEmpty({ userId: user.id })
      .then(n => { if (n > 0) pushPullOnce({ userId: user.id }).catch(console.error) })
      .catch(err => console.error('seed', err))
  }, [user])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
    }, 10_000)
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (!user) return
    const onOnline = () => {
      drainVoiceQueue({
        processBlob: async (blob) => {
          const fd = new FormData()
          fd.append('audio', blob, 'voice.webm')
          const res = await fetch('/api/voice', { method: 'POST', body: fd })
          if (!res.ok) throw new Error(`voice ${res.status}`)
          return { ok: true }
        },
        maxRetries: 3,
      }).catch(err => console.error('drain', err))
    }
    window.addEventListener('online', onOnline)
    onOnline()
    return () => window.removeEventListener('online', onOnline)
  }, [user])

  const categories = useCategories(user?.id)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  async function parseText() {
    if (!text.trim() || !user) return
    setParsing(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          categories: categories.map(c => ({ id: c.id, name: c.name, kind: c.kind })),
        }),
      })
      if (!res.ok) throw new Error(`/api/agent ${res.status}`)
      const data = await res.json() as { payload: MoneyPayload }
      setDraft(data.payload as ChipDraft)
      setText('')
    } catch (err) {
      console.error(err)
      setDraft({
        amount: 0, currency: 'INR', direction: 'out',
        occurred_at: new Date().toISOString(),
        source: 'manual',
        raw_input: text.trim(),
      })
      setText('')
    } finally {
      setParsing(false)
    }
  }

  async function confirmEntry(
    final: ChipDraft,
    recurring: { enabled: boolean; period: 'daily'|'weekly'|'monthly'|'yearly'; intervalCount: number },
  ) {
    if (!user) return

    let ruleId: string | null = null
    if (recurring.enabled) {
      ruleId = crypto.randomUUID()
      const ruleOp = await generateOp({
        entity_kind: 'recurring',
        entity_id: ruleId,
        op_type: 'create',
        payload: {
          amount: final.amount, currency: final.currency, direction: final.direction,
          category_id: final.category_id ?? null,
          description: final.description ?? null,
          period: recurring.period,
          interval_count: recurring.intervalCount,
          anchor_at: final.occurred_at,
          next_due_at: nextDueFromAnchor(final.occurred_at, recurring.period, recurring.intervalCount),
          end_condition_kind: 'never',
          is_active: 1,
        },
        user_id: user.id,
      })
      await applyLocalOp(ruleOp)
    }

    const entryOp = await generateOp({
      entity_kind: 'money',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        amount: final.amount, currency: final.currency, direction: final.direction,
        category_id: final.category_id ?? null,
        description: final.description ?? null,
        occurred_at: final.occurred_at,
        source: final.source,
        raw_input: final.raw_input ?? null,
        recurring_rule_id: ruleId,
      },
      user_id: user.id,
    })
    await applyLocalOp(entryOp)
    setDraft(null)
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }

  if (!user) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pulse</h1>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-xs text-muted-foreground hover:underline">Settings</Link>
          <Button size="sm" variant="outline"
            onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
            Sign out
          </Button>
        </div>
      </header>
      <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>

      <MoneyCard userId={user.id} />

      <div className="flex justify-center py-2">
        <VoiceRecorder
          disabled={draft !== null || parsing}
          onParsed={(payload, transcript) => {
            if (!payload) {
              setDraft({
                amount: 0, currency: 'INR', direction: 'out',
                occurred_at: new Date().toISOString(),
                source: 'voice', raw_input: transcript,
              })
            } else {
              setDraft(payload as ChipDraft)
            }
          }}
        />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); parseText() }}
        className="flex gap-2"
      >
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='spent 80 on chai'
          disabled={parsing || draft !== null}
        />
        <Button type="submit" disabled={parsing || draft !== null || !text.trim()}>
          {parsing ? 'Parsing…' : 'Parse'}
        </Button>
      </form>

      {draft && (
        <ConfirmationChip
          userId={user.id}
          draft={draft}
          categoryById={categoryById}
          onConfirm={confirmEntry}
          onCancel={() => setDraft(null)}
        />
      )}

      <MoneyList userId={user.id} />
    </main>
  )
}
