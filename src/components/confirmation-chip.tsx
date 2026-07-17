'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/components/category-picker'
import { PeriodPicker, type Period } from '@/components/period-picker'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currency'
import { formatLocalDateTime } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { TaskPayload } from '@/lib/op-schemas/task'
import type { LearningPayload } from '@/lib/op-schemas/learning'
import type { CategoryRow } from '@/lib/dexie'

export type ChipDraft =
  | (MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string })
  | (TaskPayload & { kind: 'task' })
  | (LearningPayload & { kind: 'learning' })

type Props = {
  userId: string
  draft: ChipDraft
  categoryById: Map<string, CategoryRow>
  onConfirm: (final: ChipDraft, recurring: { enabled: boolean; period: Period; intervalCount: number }) => Promise<void>
  onCancel: () => void
}

export function ConfirmationChip({ userId, draft, categoryById, onConfirm, onCancel }: Props) {
  if (draft.kind === 'task') {
    return <ConfirmationChipTask draft={draft} onConfirm={onConfirm} onCancel={onCancel} />
  }
  if (draft.kind === 'learning') {
    return <ConfirmationChipLearning draft={draft} onConfirm={onConfirm} onCancel={onCancel} />
  }
  return <ConfirmationChipMoney userId={userId} draft={draft} categoryById={categoryById} onConfirm={onConfirm} onCancel={onCancel} />
}

function ConfirmationChipMoney({
  userId,
  draft,
  categoryById,
  onConfirm,
  onCancel,
}: {
  userId: string
  draft: MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string }
  categoryById: Map<string, CategoryRow>
  onConfirm: Props['onConfirm']
  onCancel: () => void
}) {
  const [d, setD] = useState<MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string }>(draft)
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category'>(null)
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [period, setPeriod] = useState<Period>('monthly')
  const [intervalCount, setIntervalCount] = useState(1)
  const [busy, setBusy] = useState(false)

  const major = (d.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const symbol = currencySymbol(d.currency)
  const cat = d.category_id ? categoryById.get(d.category_id) : undefined

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm(d, { enabled: makeRecurring, period, intervalCount }) } finally { setBusy(false) }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className={cn(
          'font-semibold uppercase tracking-wide',
          d.direction === 'out' ? 'text-rose-500' : 'text-emerald-500',
        )}>
          {d.direction === 'out' ? '💸 Spend' : '💰 Income'}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
          onClick={() => setD(s => ({ ...s, direction: s.direction === 'out' ? 'in' : 'out' }))}
        >
          flip
        </button>
      </div>

      {d.receiptPreviewUrl && (
        <div className="relative mb-3 h-40 w-full overflow-hidden rounded-md">
          <Image
            src={d.receiptPreviewUrl}
            alt="receipt"
            fill
            unoptimized
            className="object-contain"
          />
        </div>
      )}

      {editingField === 'amount' ? (
        <Input
          autoFocus
          inputMode="decimal"
          defaultValue={major}
          onBlur={(e) => {
            const v = parseFloat(e.currentTarget.value)
            if (!Number.isNaN(v) && v >= 0) setD(s => ({ ...s, amount: Math.round(v * 100) }))
            setEditingField(null)
          }}
          className="mb-3 font-mono text-3xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('amount')}
          className="mb-3 block font-mono text-3xl font-semibold tabular-nums focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
        >
          {symbol}{major}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditingField('category')}
          className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        >
          {cat ? `${cat.icon ?? ''} ${cat.name}` : 'Pick category…'}
        </button>
        {editingField === 'description' ? (
          <Input
            autoFocus
            defaultValue={d.description ?? ''}
            onBlur={(e) => {
              setD(s => ({ ...s, description: e.currentTarget.value || null }))
              setEditingField(null)
            }}
            className="h-7 max-w-[200px] text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('description')}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {d.description || '+ description'}
          </button>
        )}
      </div>

      {editingField === 'category' && (
        <div className="mb-3 rounded-md border bg-background p-2">
          <CategoryPicker
            userId={userId}
            kind={d.direction === 'out' ? 'spend' : 'income'}
            selectedId={d.category_id ?? null}
            onSelect={(id) => { setD(s => ({ ...s, category_id: id })); setEditingField(null) }}
          />
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2">
        <label className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span>Make recurring</span>
          <input
            type="checkbox"
            checked={makeRecurring}
            onChange={e => setMakeRecurring(e.currentTarget.checked)}
          />
        </label>
        {makeRecurring && (
          <PeriodPicker
            period={period}
            intervalCount={intervalCount}
            onChange={(p, n) => { setPeriod(p); setIntervalCount(n) }}
          />
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy}>
          Confirm {symbol}{major}
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function ConfirmationChipTask({
  draft,
  onConfirm,
  onCancel,
}: {
  draft: TaskPayload & { kind: 'task' }
  onConfirm: Props['onConfirm']
  onCancel: () => void
}) {
  const [d, setD] = useState<TaskPayload & { kind: 'task' }>(draft)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDue, setEditingDue] = useState(false)
  const [busy, setBusy] = useState(false)
  const { prefs } = useUserPrefs()

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm(d, { enabled: false, period: 'monthly', intervalCount: 1 }) }
    finally { setBusy(false) }
  }

  const dueDisplay = d.due_at
    ? formatLocalDateTime(d.due_at, prefs.tz)
    : 'no due date'

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-violet-500">
          ✅ Task
        </span>
        <span className="text-muted-foreground">priority: {d.priority}</span>
      </div>

      {editingTitle ? (
        <Input
          autoFocus
          defaultValue={d.title}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, title: v }))
            setEditingTitle(false)
          }}
          className="mb-3 font-mono text-2xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          className="mb-3 block font-mono text-2xl font-semibold text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
        >
          {d.title}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {editingDue ? (
          <Input
            autoFocus
            type="datetime-local"
            defaultValue={d.due_at ? d.due_at.slice(0, 16) : ''}
            onBlur={(e) => {
              const v = e.currentTarget.value
              setD(s => ({ ...s, due_at: v ? new Date(v).toISOString() : null }))
              setEditingDue(false)
            }}
            className="h-7 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDue(true)}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {d.due_at ? `📅 ${dueDisplay}` : '+ due date'}
          </button>
        )}

        <select
          value={d.priority}
          onChange={e => setD(s => ({ ...s, priority: e.target.value as 'low' | 'medium' | 'high' }))}
          className="rounded-md border bg-muted px-2 py-0.5 text-xs"
        >
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.title.trim()}>
          Confirm task
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function ConfirmationChipLearning({
  draft,
  onConfirm,
  onCancel,
}: {
  draft: LearningPayload & { kind: 'learning' }
  onConfirm: Props['onConfirm']
  onCancel: () => void
}) {
  const [d, setD] = useState<LearningPayload & { kind: 'learning' }>(draft)
  const [editingText, setEditingText] = useState(false)
  const [editingAttribution, setEditingAttribution] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm(d, { enabled: false, period: 'monthly', intervalCount: 1 })
    }
    finally { setBusy(false) }
  }

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (trimmed && !d.tags.includes(trimmed) && d.tags.length < 12) {
      setD(s => ({ ...s, tags: [...s.tags, trimmed] }))
      setNewTag('')
    }
  }

  function removeTag(tag: string) {
    setD(s => ({ ...s, tags: s.tags.filter(t => t !== tag) }))
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-cyan-500">
          📚 Learn
        </span>
      </div>

      {editingText ? (
        <textarea
          autoFocus
          defaultValue={d.text}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, text: v }))
            setEditingText(false)
          }}
          className="mb-3 w-full rounded-md border bg-background p-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none resize-none"
          rows={3}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingText(true)}
          className="mb-3 block w-full whitespace-pre-wrap text-left font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
        >
          {d.text}
        </button>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5 items-start">
        {d.tags.map((tag) => (
          <div key={tag} className="flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {d.tags.length < 12 && (
          <div className="flex items-center gap-1">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag(newTag)
                }
              }}
              placeholder="add tag…"
              className="h-7 text-xs max-w-[100px]"
            />
            <button
              type="button"
              onClick={() => addTag(newTag)}
              className="text-xs px-2 py-0.5 rounded-md border bg-muted hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            >
              +
            </button>
          </div>
        )}
      </div>

      {editingAttribution ? (
        <Input
          autoFocus
          defaultValue={d.attribution ?? ''}
          onBlur={(e) => {
            setD(s => ({ ...s, attribution: e.currentTarget.value || null }))
            setEditingAttribution(false)
          }}
          placeholder="source / where learned…"
          className="mb-3 h-7 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingAttribution(true)}
          className="mb-3 block w-full text-left rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        >
          {d.attribution || '+ source / attribution'}
        </button>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.text.trim()}>
          Confirm learning
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}
