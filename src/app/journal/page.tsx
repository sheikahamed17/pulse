'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useJournal } from '@/hooks/use-journal'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { formatLocalDateOnly } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'
import type { JournalRow } from '@/lib/dexie'

const MOODS = ['😀', '🙂', '😐', '😕', '😢'] as const

export default function JournalPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const [body, setBody] = useState('')
  const [mood, setMood] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else {
        setUserId(res.data.user.id)
        setDate(new Date().toISOString().split('T')[0])
      }
    })
  }, [router])

  const entries = useJournal(userId ?? undefined)

  function resetForm() {
    setBody('')
    setMood(null)
    setEditingId(null)
    setDate(new Date().toISOString().split('T')[0])
  }

  async function save() {
    if (!userId || !body.trim() || !date) return
    const occurredAt = new Date(date + 'T12:00:00').toISOString()
    const op = editingId
      ? await generateOp({
          entity_kind: 'journal', entity_id: editingId, op_type: 'update',
          payload: { body: body.trim(), mood, occurred_at: occurredAt },
          user_id: userId,
        })
      : await generateOp({
          entity_kind: 'journal', entity_id: crypto.randomUUID(), op_type: 'create',
          payload: { body: body.trim(), mood, occurred_at: occurredAt, source: 'manual' },
          user_id: userId,
        })
    await applyLocalOp(op)
    resetForm()
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  function startEdit(e: JournalRow) {
    setEditingId(e.id)
    setBody(e.body)
    setMood(e.mood ?? null)
    setDate(e.occurred_at.slice(0, 10))
  }

  async function remove(id: string) {
    if (!userId) return
    const op = await generateOp({ entity_kind: 'journal', entity_id: id, op_type: 'delete', payload: {}, user_id: userId })
    await applyLocalOp(op)
    if (editingId === id) resetForm()
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Journal</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/app')}>← Back</Button>
        </header>

        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="How was your day?"
            rows={4}
            aria-label="Journal entry"
            className="w-full rounded-md border bg-background p-2 text-sm resize-none focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          />
          <div className="flex items-center gap-1" role="group" aria-label="Mood">
            {MOODS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(mood === m ? null : m)}
                aria-label={`Mood ${m}`}
                aria-pressed={mood === m}
                className={`min-h-[44px] min-w-[44px] rounded-lg text-xl transition ${mood === m ? 'bg-accent-2/25 ring-2 ring-accent-2' : 'hover:bg-white/5'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              aria-label="Entry date"
              className="glass-soft rounded-lg border border-input px-2 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            />
            <Button onClick={save} disabled={!body.trim()} className="flex-1">
              {editingId ? 'Save changes' : 'Add entry'}
            </Button>
            {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
          </div>
        </section>

        <ul className="flex flex-col gap-2">
          {entries.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No journal entries yet. Write your first above.</li>
          )}
          {entries.map(e => (
            <li key={e.id} className="glass-soft flex flex-col gap-1 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {e.mood && <span className="text-base">{e.mood}</span>}
                  <span className="font-mono">{formatLocalDateOnly(e.occurred_at, prefs.tz)}</span>
                </span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => startEdit(e)} aria-label="Edit entry" className="min-h-[44px] px-2 text-xs text-muted-foreground hover:text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">Edit</button>
                  <button type="button" onClick={() => remove(e.id)} aria-label="Delete entry" className="min-h-[44px] px-2 text-xs text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">Delete</button>
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{e.body}</p>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
