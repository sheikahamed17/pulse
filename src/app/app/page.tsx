'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { LockGate } from '@/components/lock-gate'
import { PulseLogo } from '@/components/pulse-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import { ConfirmationChip, type ChipDraft } from '@/components/confirmation-chip'
import { QueryAnswerCard } from '@/components/query-answer-card'
import { QueryListAnswer } from '@/components/query-list-answer'
import type { QueryPlan } from '@/lib/query-plans'
import { isQueryPlan } from '@/lib/query-plans'
import { filterTasksForQuery } from '@/lib/query-task-exec'
import { filterLearningsForQuery } from '@/lib/query-learning-exec'
import { filterNotesForQuery } from '@/lib/query-notes-exec'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useLearnings } from '@/hooks/use-learnings'
import { useNotes } from '@/hooks/use-notes'
import { formatLocalDateTime } from '@/lib/format'
import { Circle, CheckCircle2 } from 'lucide-react'
import { MoneyCard } from '@/components/money-card'
import { MoneyList } from '@/components/money-list'
import { DigestCard } from '@/components/digest-card'
import { VoiceRecorder } from '@/components/voice-recorder'
import { ReceiptButton } from '@/components/receipt-button'
import { TabBar } from '@/components/tab-bar'
import { TaskList } from '@/components/task-list'
import { TaskFilter } from '@/components/task-filter'
import { TaskSummary } from '@/components/task-summary'
import { LearningList } from '@/components/learning-list'
import { LearningTagFilter } from '@/components/learning-tag-filter'
import { LearningSummary } from '@/components/learning-summary'
import { NotesList } from '@/components/notes-list'
import { NotesTagFilter } from '@/components/notes-tag-filter'
import { useTabState } from '@/hooks/use-tab-state'
import { useCategories } from '@/hooks/use-categories'
import { useTasks, type TaskFilter as TaskFilterValue } from '@/hooks/use-tasks'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { db } from '@/lib/dexie'
import { seedDefaultCategoriesIfEmpty } from '@/lib/seed-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { drainVoiceQueue } from '@/lib/voice-queue'
import { callVoiceApiStreaming } from '@/lib/voice-sse'
import { drainReceiptQueue } from '@/lib/receipt-queue'
import { callReceiptApiStreaming } from '@/lib/receipt-sse'
import { computeNextDue } from '@/lib/recurring'
import { withWebLock } from '@/lib/web-lock'

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

function QueryTaskListAnswer({ userId, plan, onDismiss }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_task' }>; onDismiss: () => void }) {
  const allTasks = useTasks(userId, 'all')
  const nowIso = new Date().toISOString()
  const filtered = filterTasksForQuery(allTasks, plan, nowIso)
  const { prefs } = useUserPrefs()

  const title = plan.status === 'open' ? 'Open tasks' :
    plan.status === 'overdue' ? 'Overdue tasks' :
    plan.status === 'done' ? 'Completed tasks' :
    'All tasks'

  return (
    <QueryListAnswer
      title={title}
      count={filtered.length}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col gap-2">
        {filtered.map(t => {
          const isCompleted = !!t.completed_at
          const isOverdue = !isCompleted && t.due_at && t.due_at < nowIso
          return (
            <li
              key={t.id}
              className="glass-soft rounded-2xl relative flex items-start justify-between gap-3 p-3"
            >
              <div className="flex flex-1 items-start gap-2 text-left">
                {isCompleted ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-2" aria-label="Task completed" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-label={isOverdue ? "Task overdue" : "Task pending"} />
                )}
                <div className="flex flex-col">
                  <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.priority !== 'medium' && (
                      <span className={`mr-2 ${t.priority === 'high' ? 'text-destructive' : ''}`}>
                        {t.priority}
                      </span>
                    )}
                    {t.due_at && (
                      <span className={`font-mono tabular-nums ${isOverdue ? 'text-warning' : ''}`}>
                        due {formatLocalDateTime(t.due_at, prefs.tz)}
                        {isOverdue && ' · overdue'}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </QueryListAnswer>
  )
}

function QueryLearningListAnswer({ userId, plan, onDismiss }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_learning' }>; onDismiss: () => void }) {
  const allLearnings = useLearnings(userId)
  const filtered = filterLearningsForQuery(allLearnings, plan)
  const { prefs } = useUserPrefs()

  let title = 'Learnings'
  if (plan.search) title = `Learnings about ${plan.search}`
  if (plan.tags.length > 0) title = `Learnings tagged ${plan.tags.join(', ')}`
  if (plan.search && plan.tags.length > 0) title = `Learnings about ${plan.search} tagged ${plan.tags.join(', ')}`
  if (plan.period) title += ` ${plan.period.label}`

  return (
    <QueryListAnswer
      title={title}
      count={filtered.length}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col gap-2">
        {filtered.map(l => (
          <li
            key={l.id}
            className="glass-soft rounded-2xl relative flex flex-col gap-2 p-3"
          >
            <p className="text-sm">{l.text}</p>
            {l.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {l.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-muted-foreground border border-white/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
              <div className="flex items-center gap-2">
                {l.attribution && (
                  <span className="truncate">— {l.attribution}</span>
                )}
              </div>
              <span className="font-mono tabular-nums flex-shrink-0">
                {formatLocalDateTime(l.occurred_at, prefs.tz)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </QueryListAnswer>
  )
}

function QueryNotesListAnswer({ userId, plan, onDismiss }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_notes' }>; onDismiss: () => void }) {
  const allNotes = useNotes(userId)
  const filtered = filterNotesForQuery(allNotes, plan)
  const { prefs } = useUserPrefs()

  let title = 'Notes'
  if (plan.search) title = `Notes about ${plan.search}`
  if (plan.tags.length > 0) title = `Notes tagged ${plan.tags.join(', ')}`
  if (plan.search && plan.tags.length > 0) title = `Notes about ${plan.search} tagged ${plan.tags.join(', ')}`
  if (plan.period) title += ` ${plan.period.label}`

  return (
    <QueryListAnswer
      title={title}
      count={filtered.length}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col gap-2">
        {filtered.map(n => (
          <li
            key={n.id}
            className="glass-soft rounded-2xl relative flex flex-col gap-2 p-3"
          >
            <p className="text-sm">{n.title || n.body}</p>
            {n.title && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
            {n.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {n.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-muted-foreground border border-white/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span className="font-mono tabular-nums flex-shrink-0">
                {formatLocalDateTime(n.occurred_at, prefs.tz)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </QueryListAnswer>
  )
}

function AppPageInner() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<ChipDraft | null>(null)
  const [queryPlan, setQueryPlan] = useState<QueryPlan | null>(null)
  const [parsing, setParsing] = useState(false)
  const [activeTab, setTab] = useTabState()
  const [taskFilter, setTaskFilter] = useState<TaskFilterValue>('open')
  const [selectedLearningTag, setSelectedLearningTag] = useState<string | null>(null)
  const [selectedNotesTag, setSelectedNotesTag] = useState<string | null>(null)
  const [notesSearchQuery, setNotesSearchQuery] = useState('')
  const [notesSearchInputValue, setNotesSearchInputValue] = useState('')
  const notesSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { status: pushStatus, subscribe: pushSubscribe } = usePushSubscription()
  const [showPushNudge, setShowPushNudge] = useState(false)

  // Debounce notes search input (~150ms)
  useEffect(() => {
    if (notesSearchDebounceRef.current) clearTimeout(notesSearchDebounceRef.current)
    notesSearchDebounceRef.current = setTimeout(() => {
      setNotesSearchQuery(notesSearchInputValue)
    }, 150)
    return () => {
      if (notesSearchDebounceRef.current) clearTimeout(notesSearchDebounceRef.current)
    }
  }, [notesSearchInputValue])

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
      withWebLock('pulse-voice-drain', async () => {
        await drainVoiceQueue({
          processBlob: async (blob) => {
            // Background drain — events are ignored (no UI to update)
            const final = await callVoiceApiStreaming(blob, () => {})
            if (!final) throw new Error('voice drain failed')
            return { ok: true }
          },
          maxRetries: 3,
        })
      }).catch(err => console.error('drain', err))
    }
    window.addEventListener('online', onOnline)
    onOnline()
    return () => window.removeEventListener('online', onOnline)
  }, [user])

  useEffect(() => {
    if (!user) return
    const onOnline = () => {
      withWebLock('pulse-receipt-drain', async () => {
        await drainReceiptQueue({
          processBlob: async (blob) => {
            // Background drain — mirrors the voice-queue drain effect exactly.
            // The R2 upload + vision parse happen server-side; the parsed payload
            // is intentionally discarded here (no chip surfaced) so a background
            // drain never clobbers an active edit. The receipt image is preserved
            // in R2 regardless and is viewable via the T36 viewer. Surfacing a
            // drained receipt as a chip would need a draftRef (to read current
            // draft without putting `draft` in deps) — deliberately deferred.
            const final = await callReceiptApiStreaming(blob, () => {})
            if (!final) throw new Error('receipt drain failed')
            return { ok: true }
          },
          maxRetries: 3,
        })
      }).catch(err => console.error('receipt drain', err))
    }
    window.addEventListener('online', onOnline)
    onOnline()
    return () => window.removeEventListener('online', onOnline)
  }, [user])

  const categories = useCategories(user?.id)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const openTasksForBadge = useTasks(user?.id, 'open')
  const taskBadgeCount = useMemo(() => {
    const now = new Date().toISOString()
    return openTasksForBadge.filter(t => !t.due_at || t.due_at <= now).length
  }, [openTasksForBadge])

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
      const data = await res.json() as { intent: string; payload: ChipDraft | QueryPlan | null }

      if (!data.payload) {
        setText('')
        return
      }
      if (isQueryPlan(data.payload)) {
        setQueryPlan(data.payload)
        setText('')
      } else {
        setDraft(data.payload as ChipDraft)
        setText('')
      }
    } catch (err) {
      console.error(err)
      // Fallback to a blank money draft (Phase 1 behavior preserved)
      setDraft({
        kind: 'money',
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

    if (final.kind === 'task') {
      const op = await generateOp({
        entity_kind: 'task',
        entity_id: crypto.randomUUID(),
        op_type: 'create',
        payload: {
          title: final.title,
          due_at: final.due_at ?? null,
          priority: final.priority,
          completed_at: null,
          source: final.source,
          raw_input: final.raw_input ?? null,
        },
        user_id: user.id,
      })
      await applyLocalOp(op)
      if (activeTab !== 'tasks') setTab('tasks')
      setDraft(null)
      if (final.due_at && pushStatus === 'unsubscribed') {
        try {
          const shown = await db.sync_meta.get('push-nudge-shown')
          if (!shown) setShowPushNudge(true)
        } catch (err) {
          console.warn('nudge check failed:', err)
        }
      }
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    if (final.kind === 'learning') {
      const op = await generateOp({
        entity_kind: 'learning',
        entity_id: crypto.randomUUID(),
        op_type: 'create',
        payload: {
          text: final.text,
          tags: final.tags,
          attribution: final.attribution ?? null,
          occurred_at: final.occurred_at,
          source: final.source,
        },
        user_id: user.id,
      })
      await applyLocalOp(op)
      setDraft(null)
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    if (final.kind === 'note') {
      const op = await generateOp({
        entity_kind: 'note',
        entity_id: crypto.randomUUID(),
        op_type: 'create',
        payload: {
          body: final.body,
          title: final.title ?? null,
          tags: final.tags,
          occurred_at: final.occurred_at,
          source: final.source,
        },
        user_id: user.id,
      })
      await applyLocalOp(op)
      setDraft(null)
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    // Money kind (Phase 1 logic, preserved verbatim)
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
        receipt_key: final.receipt_key ?? null,
      },
      user_id: user.id,
    })
    await applyLocalOp(entryOp)
    if (activeTab !== 'money') setTab('money')
    setDraft(null)
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }

  if (!user) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto grid w-full max-w-5xl gap-6 p-6 pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-6 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PulseLogo className="size-6" />
              <h1 className="text-2xl font-semibold">Pulse</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/settings" className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors">
                <Settings className="h-5 w-5" />
              </Link>
              <Button size="sm" variant="outline"
                onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
                Sign out
              </Button>
            </div>
          </header>
          <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>

          {/* Shared input header — voice + text — dispatches to either tab */}
          <div className="glass rounded-2xl flex items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <VoiceRecorder
                disabled={draft !== null || parsing || queryPlan !== null}
                onParsed={(payload, transcript) => {
                  if (!payload) {
                    setDraft({
                      kind: 'money',
                      amount: 0, currency: 'INR', direction: 'out',
                      occurred_at: new Date().toISOString(),
                      source: 'voice', raw_input: transcript,
                    })
                  } else if ((payload as QueryPlan).kind === 'query_money') {
                    setQueryPlan(payload as QueryPlan)
                  } else {
                    setDraft(payload as ChipDraft)
                  }
                }}
              />
              <ReceiptButton
                disabled={draft !== null || parsing || queryPlan !== null}
                onParsed={(payload, previewUrl) => {
                  setDraft({ ...(payload as unknown as ChipDraft), receiptPreviewUrl: previewUrl } as ChipDraft)
                }}
              />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); parseText() }} className="flex flex-1 gap-2 ml-2">
              <Input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder='spent 80 on chai — or — remind me to call mom'
                disabled={parsing || draft !== null || queryPlan !== null}
                className="bg-transparent placeholder:text-muted-foreground border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button type="submit" disabled={parsing || draft !== null || queryPlan !== null || !text.trim()}>
                {parsing ? 'Parsing…' : 'Parse'}
              </Button>
            </form>
          </div>

          {draft && (
            <ConfirmationChip
              userId={user.id}
              draft={draft}
              categoryById={categoryById}
              onConfirm={confirmEntry}
              onCancel={() => setDraft(null)}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_money' && (
            <QueryAnswerCard
              userId={user.id}
              plan={queryPlan}
              onDismiss={() => setQueryPlan(null)}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_task' && (
            <QueryTaskListAnswer
              userId={user.id}
              plan={queryPlan}
              onDismiss={() => setQueryPlan(null)}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_learning' && (
            <QueryLearningListAnswer
              userId={user.id}
              plan={queryPlan}
              onDismiss={() => setQueryPlan(null)}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_notes' && (
            <QueryNotesListAnswer
              userId={user.id}
              plan={queryPlan}
              onDismiss={() => setQueryPlan(null)}
            />
          )}

          {/* Desktop tab bar — appears in document flow above the tab content */}
          <div className="hidden md:block">
            <TabBar active={activeTab} onChange={setTab} taskBadgeCount={taskBadgeCount} />
          </div>

          {showPushNudge && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <span className="text-blue-900">Get notified when tasks are due</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setShowPushNudge(false)
                    await db.sync_meta.put({ key: 'push-nudge-shown', value: '1' })
                    await pushSubscribe().catch((err) => console.error('subscribe', err))
                  }}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Enable
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowPushNudge(false)
                    await db.sync_meta.put({ key: 'push-nudge-shown', value: '1' })
                  }}
                  className="text-blue-600 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Conditional tab content */}
          {activeTab === 'money' && (
            <div className="flex flex-col gap-3">
              <DigestCard userId={user.id} />
              <div className="md:hidden">
                <MoneyCard userId={user.id} />
              </div>
              <MoneyList userId={user.id} />
            </div>
          )}
          {activeTab === 'tasks' && (
            <div className="flex flex-col gap-3">
              <TaskFilter active={taskFilter} onChange={setTaskFilter} />
              <TaskList userId={user.id} filter={taskFilter} />
            </div>
          )}
          {activeTab === 'learning' && (
            <div className="flex flex-col gap-3">
              <LearningTagFilter userId={user.id} selectedTag={selectedLearningTag} onChange={setSelectedLearningTag} />
              <LearningList userId={user.id} selectedTag={selectedLearningTag} />
            </div>
          )}
          {activeTab === 'notes' && (
            <div className="flex flex-col gap-3">
              <Input
                aria-label="Search notes"
                value={notesSearchInputValue}
                onChange={e => setNotesSearchInputValue(e.target.value)}
                placeholder="Search notes…"
                className="min-h-[44px] bg-white/5 border border-white/10 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-0"
              />
              <NotesTagFilter userId={user.id} selectedTag={selectedNotesTag} onChange={setSelectedNotesTag} />
              <NotesList
                userId={user.id}
                selectedTag={selectedNotesTag}
                searchQuery={notesSearchQuery}
              />
            </div>
          )}
        </div>

        {/* Desktop-only sticky sidebar (right column) */}
        <aside className="hidden md:block">
          <div className="sticky top-6 flex flex-col gap-4">
            {activeTab === 'money' && <MoneyCard userId={user.id} />}
            {activeTab === 'tasks' && <TaskSummary userId={user.id} />}
            {activeTab === 'learning' && <LearningSummary userId={user.id} />}
          </div>
        </aside>
      </main>

      {/* Mobile-only fixed bottom tab bar */}
      <div className="md:hidden">
        <TabBar active={activeTab} onChange={setTab} taskBadgeCount={taskBadgeCount} />
      </div>
    </>
  )
}

// AppPageInner reads the URL via useTabState → useSearchParams, which makes it a
// CSR-bailout component. `next build` requires such a component to sit under a
// Suspense boundary during static prerender of /app — without this wrapper the
// route fails to build and the Cloudflare deploy fails. (Missed until now
// because the gate ran typecheck/lint/test but never `next build`.)
export default function AppPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <LockGate>
        <AppPageInner />
      </LockGate>
    </Suspense>
  )
}
