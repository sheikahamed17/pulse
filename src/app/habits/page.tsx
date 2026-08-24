'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useHabits, useArchivedHabits } from '@/hooks/use-habits'
import { useHabitLogs } from '@/hooks/use-habit-logs'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { habitStreaks } from '@/lib/habits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import type { HabitRow } from '@/lib/dexie'

export default function HabitsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const habits = useHabits(userId ?? undefined)
  const archived = useArchivedHabits(userId ?? undefined)
  const logs = useHabitLogs(userId ?? undefined)
  const { prefs } = useUserPrefs()

  const { todayStr } = useMemo(() => {
    const nowMs = new Date().getTime()
    const tz = prefs.tz ?? 'Asia/Kolkata'
    let today = ''
    try {
      today = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: tz })
    } catch {
      today = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'UTC' })
    }
    return { todayStr: today }
  }, [prefs.tz])

  async function addHabit() {
    if (!userId || !newName.trim()) return

    const op = await generateOp({
      entity_kind: 'habit',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        name: newName.trim(),
        icon: newIcon.trim() || null,
        is_archived: 0,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewIcon('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function updateHabit(id: string, payload: Record<string, number>) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'habit',
      entity_id: id,
      op_type: 'update',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveHabit(id: string) {
    await updateHabit(id, { is_archived: 1 })
  }

  async function restoreHabit(id: string) {
    await updateHabit(id, { is_archived: 0 })
  }

  async function toggleToday(habit: HabitRow) {
    if (!userId) return

    const habitLogs = logs.filter(l => l.habit_id === habit.id && !l.deleted_at)
    const days = habitLogs.map(l => l.day)
    const s = habitStreaks(days, todayStr)

    const logId = `hlog-${habit.id}-${todayStr}`

    if (s.completedToday) {
      // Delete the log
      const op = await generateOp({
        entity_kind: 'habit_log',
        entity_id: logId,
        op_type: 'delete',
        payload: {},
        user_id: userId,
      })
      await applyLocalOp(op)
    } else {
      // Create the log
      const op = await generateOp({
        entity_kind: 'habit_log',
        entity_id: logId,
        op_type: 'create',
        payload: {
          habit_id: habit.id,
          day: todayStr,
        },
        user_id: userId,
      })
      await applyLocalOp(op)
    }

    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Habits</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/app')}>← App</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Habit name…"
                maxLength={40}
                aria-label="Habit name"
              />
              <Input
                value={newIcon}
                onChange={e => setNewIcon(e.target.value)}
                placeholder="Icon"
                maxLength={8}
                className="w-14"
                aria-label="Habit icon"
              />
            </div>
            <Button onClick={addHabit} className="w-full">Add</Button>
          </div>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Active Habits</h2>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
            {habits.length === 0 && <li className="p-3 text-sm text-muted-foreground">Add your first habit.</li>}
            {habits.map(h => {
              const habitLogs = logs.filter(l => l.habit_id === h.id && !l.deleted_at)
              const days = habitLogs.map(l => l.day)
              const s = habitStreaks(days, todayStr)

              return (
                <li key={h.id} className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-h-[44px] items-center">
                      <button
                        type="button"
                        onClick={() => toggleToday(h)}
                        style={{ height: '44px', minWidth: '44px' }}
                        className="flex-shrink-0 flex items-center justify-center rounded-lg border border-white/20 hover:bg-white/5 transition-colors"
                        aria-label={`Mark ${h.name} done`}
                      >
                        {s.completedToday ? '✓' : '○'}
                      </button>
                      <span className="text-sm">
                        {h.icon && <span className="mr-1">{h.icon}</span>}
                        {h.name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => archiveHabit(h.id)}
                      style={{ height: '44px', minWidth: '44px' }}
                      aria-label={`Archive ${h.name}`}
                    >
                      Archive
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground pl-14">
                    🔥 {s.current} · best {s.longest} · {Math.round(s.rate30 * 100)}% (30d)
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {archived.length > 0 && (
          <ArchivedSection archived={archived} onRestore={restoreHabit} />
        )}
      </main>
    </>
  )
}

function ArchivedSection({
  archived,
  onRestore,
}: {
  archived: ReturnType<typeof useArchivedHabits>
  onRestore: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between text-left text-sm font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Archived ({archived.length})</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
          {archived.map(h => (
            <li key={h.id} className="flex items-center justify-between p-3">
              <span className="text-sm">
                {h.icon && <span className="mr-1">{h.icon}</span>}
                {h.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRestore(h.id)}
                style={{ height: '44px', minWidth: '44px' }}
                aria-label={`Restore ${h.name}`}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
