'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'
import { useUndoStack } from '@/hooks/use-undo-stack'
import type { MoneyEntryRow } from '@/lib/dexie'

type Props = { userId: string }

export function MoneyList({ userId }: Props) {
  const entries = useMoneyEntries(userId)
  const categories = useCategories(userId)
  const undo = useUndoStack()

  const categoryById = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories],
  )

  async function deleteEntry(e: MoneyEntryRow) {
    const op = await generateOp({
      entity_kind: 'money', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))

    undo.push(
      `Deleted ${formatAmount(e)}`,
      async () => {
        const undoOp = await generateOp({
          entity_kind: 'money', entity_id: e.id,
          op_type: 'update', payload: { description: e.description ?? null },
          user_id: userId,
        })
        await applyLocalOp(undoOp)
        pushPullOnce({ userId }).catch(err => console.error('sync', err))
      },
    )
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-md border">
        {entries.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">No entries yet. Tap the mic above (Phase 1.3) or type below.</li>
        )}
        {entries.map(e => {
          const cat = e.category_id ? categoryById.get(e.category_id) : undefined
          return (
            <li key={e.id} className="flex items-center justify-between p-3 text-sm">
              <div className="flex flex-col">
                <span className={e.direction === 'out' ? 'text-rose-600' : 'text-emerald-600'}>
                  {formatAmount(e)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cat ? `${cat.icon ?? ''} ${cat.name}` : 'no category'}{e.description ? ` · ${e.description}` : ''}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteEntry(e)}>Delete</Button>
            </li>
          )
        })}
      </ul>

      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {undo.entries.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-1.5 text-xs shadow">
            <span>{u.label}</span>
            <button type="button" className="font-semibold text-blue-600" onClick={() => undo.trigger(u.id)}>Undo</button>
            <button type="button" className="text-muted-foreground" onClick={() => undo.dismiss(u.id)}>×</button>
          </div>
        ))}
      </div>
    </>
  )
}

function formatAmount(e: MoneyEntryRow): string {
  const major = (e.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const sym   = ({ INR: '₹', USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[e.currency] ?? e.currency
  return `${e.direction === 'out' ? '-' : '+'}${sym}${major}`
}
