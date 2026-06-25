'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/components/category-picker'
import { PeriodPicker, type Period } from '@/components/period-picker'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currency'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { TaskPayload } from '@/lib/op-schemas/task'
import type { CategoryRow } from '@/lib/dexie'

export type ChipDraft =
  | (MoneyPayload & { kind: 'money'; draftCategoryName?: string })
  | (TaskPayload & { kind: 'task' })

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
  draft: MoneyPayload & { kind: 'money'; draftCategoryName?: string }
  categoryById: Map<string, CategoryRow>
  onConfirm: Props['onConfirm']
  onCancel: () => void
}) {
  const [d, setD] = useState<MoneyPayload & { kind: 'money'; draftCategoryName?: string }>(draft)
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
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className={cn(
          'font-semibold uppercase tracking-wide',
          d.direction === 'out' ? 'text-rose-500' : 'text-emerald-500',
        )}>
          {d.direction === 'out' ? '💸 Spend' : '💰 Income'}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:underline"
          onClick={() => setD(s => ({ ...s, direction: s.direction === 'out' ? 'in' : 'out' }))}
        >
          flip
        </button>
      </div>

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
          className="mb-3 text-3xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('amount')}
          className="mb-3 block text-3xl font-semibold tabular-nums"
        >
          {symbol}{major}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditingField('category')}
          className="rounded-md border bg-muted px-2 py-0.5 text-xs"
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
            className="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
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
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy}>
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

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm(d, { enabled: false, period: 'monthly', intervalCount: 1 }) }
    finally { setBusy(false) }
  }

  const dueDisplay = d.due_at
    ? new Date(d.due_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'no due date'

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
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
          className="mb-3 text-2xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          className="mb-3 block text-2xl font-semibold text-left"
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
            className="rounded-md border bg-muted px-2 py-0.5 text-xs"
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
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy || !d.title.trim()}>
          Confirm task
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}
