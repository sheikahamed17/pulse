'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/dexie'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useLiveQuery } from 'dexie-react-hooks'
import type { EntityRow } from '@/types/ops'

export function WidgetForm({ userId }: { userId: string }) {
  const widgets = useLiveQuery<EntityRow[], EntityRow[]>(
    () => db.widgets.where('user_id').equals(userId).toArray(),
    [userId],
    [],
  )
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    try {
      const op = await generateOp({
        entity_kind: 'widget',
        entity_id: crypto.randomUUID(),
        op_type: 'create',
        payload: { label: label.trim() },
        user_id: userId,
      })
      await applyLocalOp(op)
      setLabel('')
      pushPullOnce({ userId }).catch(err => console.error('sync error', err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="widget-label" className="sr-only">Widget label</Label>
          <Input
            id="widget-label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="New widget…"
          />
        </div>
        <Button type="submit" disabled={busy}>Add</Button>
      </form>

      <ul className="divide-y divide-border rounded-md border">
        {widgets?.length === 0 && <li className="p-3 text-sm text-muted-foreground">No widgets yet.</li>}
        {widgets?.filter(w => !w.deleted_at).map(w => (
          <li key={w.id} className="flex items-center justify-between p-3 text-sm">
            <span>{String(w.label)}</span>
            <code className="text-xs text-muted-foreground">{w.id.slice(0, 8)}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
