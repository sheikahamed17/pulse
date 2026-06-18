'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/components/category-picker'
import { cn } from '@/lib/utils'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { CategoryRow } from '@/lib/dexie'

export type ChipDraft = MoneyPayload & {
  draftCategoryName?: string
}

type Props = {
  userId: string
  draft: ChipDraft
  categoryById: Map<string, CategoryRow>
  onConfirm: (final: ChipDraft, makeRecurring: boolean) => Promise<void>
  onCancel: () => void
}

export function ConfirmationChip({ userId, draft, categoryById, onConfirm, onCancel }: Props) {
  const [d, setD] = useState<ChipDraft>(draft)
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category'>(null)
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [busy, setBusy] = useState(false)

  const major = (d.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const symbol = currencySymbol(d.currency)
  const cat = d.category_id ? categoryById.get(d.category_id) : undefined

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm(d, makeRecurring) } finally { setBusy(false) }
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

      <label className="mb-3 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span>Make recurring</span>
        <input
          type="checkbox"
          checked={makeRecurring}
          onChange={e => setMakeRecurring(e.currentTarget.checked)}
        />
      </label>

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

function currencySymbol(code: string): string {
  return { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SGD: 'S$', JPY: '¥', AUD: 'A$', CAD: 'C$' }[code] ?? code
}
