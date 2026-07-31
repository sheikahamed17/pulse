'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'

export default function SmsImportPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/ingest/sms` : '/api/ingest/sms'

  async function generate() {
    setBusy(true); setError(null); setToken(null)
    try {
      const res = await fetch('/api/ingest/token', { method: 'POST' })
      const body = await res.json().catch(() => null) as { token?: string } | null
      if (!res.ok || !body?.token) { setError('Could not generate a token. Please try again.'); return }
      setToken(body.token)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally { setBusy(false) }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Auto-import from SMS</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p>Turn your bank&apos;s transaction SMS into money entries automatically, using an iOS Shortcut that forwards matching messages to Pulse. Parsed transactions appear in your Money tab tagged <span className="whitespace-nowrap">💳 SMS</span> — edit the category or delete any that are wrong.</p>
          <p className="text-xs text-muted-foreground">Only messages your Shortcut matches are ever sent. Your token is a secret — anyone with it can add entries to your account.</p>
        </section>

        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Step 1 · Your token</span>
          <Button onClick={generate} disabled={busy}>{busy ? 'Generating…' : token ? 'Regenerate token' : 'Generate token'}</Button>
          {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
          {token && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-amber-400">Copy this now — it&apos;s shown only once. Regenerating replaces it.</p>
              <button type="button" onClick={() => copy(token)} className="glass-soft break-all rounded-lg p-2 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
                {token}
              </button>
              <span className="text-[10px] text-muted-foreground">Tap to copy.</span>
            </div>
          )}
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Step 2 · Endpoint</span>
          <button type="button" onClick={() => copy(endpoint)} className="glass-soft break-all rounded-lg p-2 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
            {endpoint}
          </button>
          <span className="text-[10px] text-muted-foreground">Tap to copy.</span>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Step 3 · iOS Shortcut</span>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs">
            <li>Open the <strong>Shortcuts</strong> app → <strong>Automation</strong> → <strong>New</strong> → <strong>When I Receive a Message</strong>.</li>
            <li>Set <strong>Sender</strong> to your bank&apos;s SMS senders (add each one). Optionally require the message to contain <em>debited</em> / <em>credited</em> / <em>UPI</em>.</li>
            <li>Turn on <strong>Run Immediately</strong> (turn off &quot;Ask Before Running&quot;).</li>
            <li>Add action <strong>Get Details of Messages</strong> → <em>Content</em>.</li>
            <li>Add action <strong>Get Contents of URL</strong>: URL = the endpoint above; Method = <strong>POST</strong>; Headers = <code>Authorization: Bearer &lt;your token&gt;</code> and <code>Content-Type: application/json</code>; Request Body = <strong>JSON</strong> with <code>text</code> = the <em>Message Content</em> variable.</li>
            <li>Save. Next matching SMS will add a 💳 SMS entry within moments.</li>
          </ol>
        </section>
      </main>
    </>
  )
}
