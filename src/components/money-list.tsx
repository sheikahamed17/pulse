'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SwipeRow } from '@/components/swipe-row'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'
import { useUndoStack } from '@/hooks/use-undo-stack'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { currencySymbol } from '@/lib/currency'
import { convertViaRates } from '@/lib/fx'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import type { MoneyEntryRow } from '@/lib/dexie'

type Props = { userId: string }

export function MoneyList({ userId }: Props) {
  const entries = useMoneyEntries(userId)
  const categories = useCategories(userId)
  const undo = useUndoStack()
  const router = useRouter()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const [expandedFx, setExpandedFx] = useState<string | null>(null)

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
      <ul className="flex flex-col gap-2">
        {entries.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">No entries yet. Tap the mic above (Phase 1.3) or type below.</li>
        )}
        {entries.map(e => {
          const cat = e.category_id ? categoryById.get(e.category_id) : undefined
          return (
            <li key={e.id} className="relative">
              <SwipeRow
                isOpen={openId === e.id}
                onOpenChange={o => setOpenId(o ? e.id : null)}
                onLongPress={() => setMenuFor(e.id)}
                onDelete={() => deleteEntry(e)}
                deleteLabel={`Delete entry: ${e.description || formatAmount(e)}`}
                className="glass-soft flex items-start justify-between gap-3 rounded-2xl p-3 text-sm transition-colors hover:bg-white/8"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  {cat && (
                    <div className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-xl bg-white/8 px-2 py-1 text-xs">
                      <span>{cat.icon ?? ''}</span>
                      <span className="text-muted-foreground">{cat.name}</span>
                    </div>
                  )}
                  <div className="text-sm font-medium text-foreground">
                    {e.description ? e.description : (cat ? cat.name : 'Uncategorized')}
                  </div>
                  {e.description && cat && (
                    <span className="text-xs text-muted-foreground">{cat.name}</span>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {e.currency !== prefs.primary_currency && (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-accent-2 transition text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                        onClick={(ev) => { ev.stopPropagation(); setExpandedFx(expandedFx === e.id ? null : e.id) }}
                      >
                        {expandedFx === e.id ? (() => {
                          const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                          return conv
                            ? `≈ ${currencySymbol(prefs.primary_currency)}${(conv.amount / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(2)} at ${conv.rateDate}`
                            : 'No FX rate yet for this date'
                        })() : '≈ convert'}
                      </button>
                    )}
                    {e.receipt_key && (
                      <button
                        type="button"
                        className="text-[10px] border border-white/20 rounded-full px-1.5 py-0.5 text-muted-foreground hover:text-accent-2 hover:border-accent-2 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          window.open(`/api/receipt/${e.receipt_key}`, '_blank', 'noopener')
                        }}
                      >
                        📎 receipt
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className={`font-mono tabular-nums text-sm font-medium whitespace-nowrap ${
                    e.direction === 'out' ? 'text-destructive' : 'text-income'
                  }`}>
                    {formatAmount(e)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px] px-2 text-xs"
                    aria-label={`Delete entry: ${e.description || formatAmount(e)}`}
                    onClick={() => deleteEntry(e)}
                  >
                    Delete
                  </Button>
                </div>
              </SwipeRow>

              {menuFor === e.id && (
                <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
                  <button
                    type="button"
                    aria-label={`Delete entry: ${e.description || formatAmount(e)}`}
                    className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    onClick={() => { deleteEntry(e); setMenuFor(null) }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                  {e.recurring_rule_id && (
                    <button
                      type="button"
                      className="px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      onClick={() => { router.push('/settings/recurring'); setMenuFor(null) }}
                    >
                      Edit recurring rule
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    onClick={() => setMenuFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {undo.entries.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-1.5 text-xs shadow">
            <span>{u.label}</span>
            <button type="button" className="font-semibold text-blue-600 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={() => undo.trigger(u.id)}>Undo</button>
            <button type="button" className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={() => undo.dismiss(u.id)}>×</button>
          </div>
        ))}
      </div>
    </>
  )
}

function formatAmount(e: MoneyEntryRow): string {
  const major = (e.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${e.direction === 'out' ? '-' : '+'}${currencySymbol(e.currency)}${major}`
}
