'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Send, RotateCcw } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { buildAgentHistory } from '@/lib/assistant'
import type { AssistantTurn } from '@/lib/assistant'
import { useCategories } from '@/hooks/use-categories'
import { QueryAnswerCard } from '@/components/query-answer-card'
import { QueryTaskListAnswer, QueryLearningListAnswer, QueryNotesListAnswer } from '@/components/query-answers'
import type { QueryPlan } from '@/lib/query-plans'
import { isQueryPlan } from '@/lib/query-plans'
import { LockGate } from '@/components/lock-gate'
import { AuroraBackground } from '@/components/aurora-background'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PulseLogo } from '@/components/pulse-logo'

const EXAMPLE_QUESTIONS = [
  'How much did I spend on food this month?',
  'What did I earn last month?',
  'Show my spending by category this week',
  'What are my open tasks?',
]

function isMoneyPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_money' }> {
  return isQueryPlan(payload) && payload.kind === 'query_money'
}

function isTaskPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_task' }> {
  return isQueryPlan(payload) && payload.kind === 'query_task'
}

function isLearningPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_learning' }> {
  return isQueryPlan(payload) && payload.kind === 'query_learning'
}

function isNotesPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_notes' }> {
  return isQueryPlan(payload) && payload.kind === 'query_notes'
}

function AssistantPageInner() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const categories = useCategories(userId ?? undefined)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || busy || !userId) return

    const userText = input.trim()
    const userTurn: AssistantTurn = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userText,
    }

    // Build history BEFORE adding the new turn
    const history = buildAgentHistory(turns)

    // Clear input immediately
    setInput('')
    setBusy(true)

    // Add the user turn to the thread
    setTurns(prev => [...prev, userTurn])

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: userText,
          categories: categories.map(c => ({ id: c.id, name: c.name, kind: c.kind })),
          history,
        }),
      })

      if (!res.ok) {
        throw new Error(`/api/agent ${res.status}`)
      }

      const data = await res.json() as { intent: string; payload: unknown }

      const assistantTurn: AssistantTurn = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: '',
        intent: data.intent,
        payload: data.payload,
      }

      setTurns(prev => [...prev, assistantTurn])
    } catch (err) {
      console.error('Agent error:', err)
      const errorTurn: AssistantTurn = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Sorry, something went wrong. Please try again.',
        intent: 'error',
      }
      setTurns(prev => [...prev, errorTurn])
    } finally {
      setBusy(false)
    }
  }

  function removeTurn(id: string) {
    setTurns(prev => prev.filter(t => t.id !== id))
  }

  function setExampleQuestion(q: string) {
    setInput(q)
  }

  if (!userId) return <p className="p-8">Loading…</p>

  const isEmpty = turns.length === 0

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-2xl w-full flex-col h-screen">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-white/10 p-4 md:p-6">
          <div className="flex items-center gap-2">
            <PulseLogo className="size-5" />
            <h1 className="text-lg font-semibold">Assistant</h1>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTurns([])}
            disabled={isEmpty}
            aria-label="Clear conversation"
            style={{ height: '44px' }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </header>

        {/* Message thread — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
          {isEmpty ? (
            <div className="flex flex-col gap-6 items-center justify-center h-full">
              <div className="flex flex-col gap-2 items-center text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold">Ask about your data</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  I can help you understand your money, tasks, learning, and notes.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full">
                {EXAMPLE_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setExampleQuestion(q)}
                    className="glass-soft rounded-xl px-4 py-3 text-left text-sm hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    type="button"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {turns.map(turn => (
                <div
                  key={turn.id}
                  className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {turn.role === 'user' ? (
                    // User bubble — right-aligned
                    <div className="max-w-xs lg:max-w-md bg-accent-2/20 rounded-2xl px-4 py-3 text-sm">
                      {turn.text}
                    </div>
                  ) : turn.intent === 'query_money' && isMoneyPlan(turn.payload) ? (
                    // Money answer card
                    <div className="w-full max-w-md">
                      <QueryAnswerCard
                        userId={userId}
                        plan={turn.payload}
                        onDismiss={() => removeTurn(turn.id)}
                      />
                    </div>
                  ) : turn.intent === 'query_task' && isTaskPlan(turn.payload) ? (
                    // Task answer card
                    <div className="w-full max-w-md">
                      <QueryTaskListAnswer
                        userId={userId}
                        plan={turn.payload}
                        onDismiss={() => removeTurn(turn.id)}
                      />
                    </div>
                  ) : turn.intent === 'query_learning' && isLearningPlan(turn.payload) ? (
                    // Learning answer card
                    <div className="w-full max-w-md">
                      <QueryLearningListAnswer
                        userId={userId}
                        plan={turn.payload}
                        onDismiss={() => removeTurn(turn.id)}
                      />
                    </div>
                  ) : turn.intent === 'query_notes' && isNotesPlan(turn.payload) ? (
                    // Notes answer card
                    <div className="w-full max-w-md">
                      <QueryNotesListAnswer
                        userId={userId}
                        plan={turn.payload}
                        onDismiss={() => removeTurn(turn.id)}
                      />
                    </div>
                  ) : (
                    // Text bubble for chat/log/error/unknown
                    <div className="max-w-xs lg:max-w-md bg-white/5 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                      {turn.intent === 'chat' || turn.intent === null
                        ? "I can answer questions about your money, tasks, learning, and notes — e.g. 'How much did I spend on food this month?'"
                        : turn.intent?.startsWith('log_') || turn.intent === 'set_budget'
                        ? "That sounds like something to record — use the + capture on the main app screen."
                        : turn.text || 'Assistant response'}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input — pinned bottom */}
        <div className="border-t border-white/10 p-4 md:p-6">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your data…"
              disabled={busy}
              aria-label="Message input"
              className="bg-white/5 border border-white/10 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-0"
            />
            <Button
              type="submit"
              disabled={!input.trim() || busy}
              size="sm"
              style={{ height: '44px', minWidth: '44px' }}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </main>
    </>
  )
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <LockGate>
        <AssistantPageInner />
      </LockGate>
    </Suspense>
  )
}
