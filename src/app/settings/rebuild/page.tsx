'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'
import { runBackfill } from '@/lib/backfill-driver'

export default function RebuildPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ totalProcessed: number; totalErrors: number; completed: boolean } | null>(null)

  async function rebuild() {
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await runBackfill(async (after) => {
        const response = await fetch('/api/admin/backfill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ after }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Rebuild server data</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p>Re-sync your history into the server tables (fixes stale budgets/insights). Safe to run anytime.</p>
        </section>

        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <Button onClick={rebuild} disabled={busy}>{busy ? 'Rebuilding…' : 'Start rebuild'}</Button>
          {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
          {result && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-green-400">Rebuilt {result.totalProcessed} ops ✓</p>
              {result.totalErrors > 0 && <p className="text-amber-400">…{result.totalErrors} errors</p>}
              {!result.completed && <p className="text-amber-400">stopped early</p>}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
