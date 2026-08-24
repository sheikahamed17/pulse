'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useAccounts } from '@/hooks/use-accounts'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { useTransfers } from '@/hooks/use-transfers'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { parseAmountInput } from '@/lib/parse-amount'
import { currencySymbol } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'

export default function TransfersPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [fromAccountId, setFromAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else {
        setUserId(res.data.user.id)
        // Set default date to today
        const today = new Date()
        setOccurredAt(today.toISOString().split('T')[0])
      }
    })
  }, [router])

  const accounts = useAccounts(userId ?? undefined)
  const allAccounts = useAllAccounts(userId ?? undefined)
  const transfers = useTransfers(userId ?? undefined)

  const fromAccount = fromAccountId ? accounts.find(a => a.id === fromAccountId) : null
  const eligibleToAccounts = useMemo(() => {
    if (!fromAccount) return []
    return accounts.filter(
      a => a.currency === fromAccount.currency && a.id !== fromAccount.id
    )
  }, [fromAccount, accounts])

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>()
    allAccounts.forEach(a => {
      map.set(a.id, a.name)
    })
    return map
  }, [allAccounts])

  async function addTransfer() {
    if (!userId || !fromAccountId || !toAccountId || !amount.trim() || !occurredAt.trim()) return
    const amountMinor = parseAmountInput(amount)
    if (amountMinor === null || amountMinor <= 0) return
    if (!fromAccount) return

    const op = await generateOp({
      entity_kind: 'transfer',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: amountMinor,
        currency: fromAccount.currency,
        occurred_at: occurredAt,
        note: note.trim() || null,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setFromAccountId(null)
    setToAccountId(null)
    setAmount('')
    setNote('')
    const today = new Date()
    setOccurredAt(today.toISOString().split('T')[0])
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function deleteTransfer(id: string) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'transfer',
      entity_id: id,
      op_type: 'delete',
      payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) return <p className="p-8">Loading…</p>

  const canSubmit = fromAccountId && toAccountId && amount.trim() && parseAmountInput(amount) !== null && parseAmountInput(amount)! > 0

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Transfers</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex flex-col gap-2">
            <select
              value={fromAccountId ?? 'none'}
              onChange={e => {
                const val = e.target.value
                setFromAccountId(val === 'none' ? null : val)
                setToAccountId(null) // Reset to-account when from changes
              }}
              className="glass-soft rounded-lg border border-input px-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
              aria-label="From account"
            >
              <option value="none">From account…</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.icon && <span>{acc.icon}</span>} {acc.name}
                </option>
              ))}
            </select>

            <select
              value={toAccountId ?? 'none'}
              onChange={e => {
                const val = e.target.value
                setToAccountId(val === 'none' ? null : val)
              }}
              disabled={eligibleToAccounts.length === 0}
              className="glass-soft rounded-lg border border-input px-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2 disabled:opacity-50"
              aria-label="To account"
            >
              <option value="none">To account…</option>
              {eligibleToAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.icon && <span>{acc.icon}</span>} {acc.name}
                </option>
              ))}
            </select>

            {fromAccount && eligibleToAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No eligible destination accounts with currency {fromAccount.currency}
              </p>
            )}

            <Input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Amount…"
              type="text"
              inputMode="decimal"
              aria-label="Transfer amount"
            />

            <Input
              value={occurredAt}
              onChange={e => setOccurredAt(e.target.value)}
              type="date"
              aria-label="Transfer date"
            />

            <Input
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 120))}
              placeholder="Note (optional)…"
              maxLength={120}
              aria-label="Transfer note"
            />

            <Button
              onClick={addTransfer}
              disabled={!canSubmit}
              className="w-full"
            >
              Transfer
            </Button>
          </div>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Transfers</h2>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
            {transfers.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">No transfers yet.</li>
            )}
            {transfers.map(t => {
              const fromName = accountNameMap.get(t.from_account_id) || 'Unknown account'
              const toName = accountNameMap.get(t.to_account_id) || 'Unknown account'
              const divisor = t.currency === 'JPY' ? 1 : 100
              const symbol = currencySymbol(t.currency)
              const dateStr = new Date(t.occurred_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })

              return (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex-1">
                    <div className="text-sm">
                      {fromName} → {toName}
                    </div>
                    <div className="text-sm font-mono text-muted-foreground">
                      {symbol}
                      {(t.amount / divisor).toLocaleString(undefined, { maximumFractionDigits: t.currency === 'JPY' ? 0 : 2 })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{dateStr}</span>
                      {t.note && <span className="text-xs text-muted-foreground">· {t.note}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteTransfer(t.id)}
                    style={{ height: '44px', minWidth: '44px' }}
                    aria-label={`Delete transfer from ${fromName} to ${toName}`}
                  >
                    Delete
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      </main>
    </>
  )
}
