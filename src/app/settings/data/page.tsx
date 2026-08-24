'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { db } from '@/lib/dexie'
import { applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { buildBackup, parseBackup, moneyEntriesToCsv } from '@/lib/data-export'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'
import type { Op } from '@/types/ops'

export default function DataPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [opCount, setOpCount] = useState(0)
  const [moneyCount, setMoneyCount] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  // Update counts whenever the page comes into focus
  useEffect(() => {
    const updateCounts = async () => {
      if (!userId) return
      const ops = await db.op_log.toArray()
      setOpCount(ops.filter(o => o.user_id === userId).length)
      const money = await db.money_entries.toArray()
      setMoneyCount(money.filter(r => r.user_id === userId && !r.deleted_at).length)
    }
    updateCounts()
  }, [userId])

  function todayStr() {
    return new Date().toISOString().slice(0, 10)
  }

  function downloadFile(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleExportBackup() {
    if (!userId) return
    setIsExporting(true)
    try {
      const ops = (await db.op_log.toArray()).filter(o => o.user_id === userId)
      const backup = buildBackup(ops as Op[], new Date().toISOString())
      downloadFile(
        `pulse-backup-${todayStr()}.json`,
        JSON.stringify(backup, null, 2),
        'application/json'
      )
    } catch (err) {
      console.error('Export backup failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportMoney() {
    if (!userId) return
    setIsExporting(true)
    try {
      const rows = (await db.money_entries.toArray()).filter(
        r => r.user_id === userId && !r.deleted_at
      )
      const csv = moneyEntriesToCsv(rows)
      downloadFile(`pulse-money-${todayStr()}.csv`, csv, 'text/csv')
    } catch (err) {
      console.error('Export money failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError('')
    setImportSuccess('')

    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      setImportError('File too large (max 10 MB)')
      e.target.value = ''
      return
    }

    setIsImporting(true)
    try {
      const text = await file.text()
      const res = parseBackup(text)

      if (!res.ok) {
        setImportError(res.error)
        e.target.value = ''
        return
      }

      if (!window.confirm(`Import ${res.ops.length} entries? This merges into your current data and can't remove anything.`)) {
        e.target.value = ''
        return
      }

      // Apply each op
      for (const op of res.ops) {
        await applyLocalOp(op)
      }

      // Sync to server
      await pushPullOnce({ userId: userId! })

      setImportSuccess(`Imported ${res.ops.length} entries.`)
      e.target.value = ''

      // Refresh counts
      const ops = await db.op_log.toArray()
      setOpCount(ops.filter(o => o.user_id === userId).length)
      const money = await db.money_entries.toArray()
      setMoneyCount(money.filter(r => r.user_id === userId && !r.deleted_at).length)
    } catch (err) {
      setImportError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      e.target.value = ''
    } finally {
      setIsImporting(false)
    }
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Data & Backup</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        {/* Export backup (JSON) */}
        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Export backup (JSON)</h2>
          <p className="text-xs text-muted-foreground">Download a complete backup of your data ({opCount} entries).</p>
          <Button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="w-full"
            style={{ minHeight: '44px' }}
            aria-label="Export backup"
          >
            {isExporting ? 'Exporting…' : 'Export backup'}
          </Button>
        </section>

        {/* Export money (CSV) */}
        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Export money (CSV)</h2>
          <p className="text-xs text-muted-foreground">Download your money entries as a spreadsheet ({moneyCount} entries).</p>
          <Button
            onClick={handleExportMoney}
            disabled={isExporting}
            className="w-full"
            style={{ minHeight: '44px' }}
            aria-label="Export money"
          >
            {isExporting ? 'Exporting…' : 'Export money'}
          </Button>
        </section>

        {/* Import backup */}
        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Import backup</h2>
          <div>
            <label htmlFor="import-file" className="text-xs text-muted-foreground mb-2 block">
              Choose a .json backup file to import
            </label>
            <input
              id="import-file"
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              disabled={isImporting}
              aria-label="Import backup file"
              className="w-full"
            />
          </div>

          {importError && (
            <p className="text-xs text-rose-400">{importError}</p>
          )}

          {importSuccess && (
            <p className="text-xs text-emerald-400">{importSuccess}</p>
          )}

          <p className="text-xs text-muted-foreground">
            Import is safe — it merges by last-writer-wins and never deletes.
          </p>
        </section>
      </main>
    </>
  )
}
