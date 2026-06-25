'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useCategories } from '@/hooks/use-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CategoriesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [kind, setKind] = useState<'spend' | 'income'>('spend')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const categories = useCategories(userId ?? undefined)
  const spend  = categories.filter(c => c.kind === 'spend')
  const income = categories.filter(c => c.kind === 'income')

  async function addCategory() {
    if (!userId || !newName.trim()) return
    const sortOrder = (kind === 'spend' ? spend.length : income.length)
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: { name: newName.trim(), kind, sort_order: sortOrder },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveCategory(id: string) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: id,
      op_type: 'update',
      payload: { is_archived: 1 },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category…" />
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'spend' | 'income')}
            className="rounded-md border bg-background px-2 text-sm"
          >
            <option value="spend">Spend</option>
            <option value="income">Income</option>
          </select>
          <Button onClick={addCategory}>Add</Button>
        </div>
      </section>

      <CategorySection title="Spend" categories={spend} onArchive={archiveCategory} />
      <CategorySection title="Income" categories={income} onArchive={archiveCategory} />
    </main>
  )
}

function CategorySection({
  title, categories, onArchive,
}: { title: string; categories: ReturnType<typeof useCategories>; onArchive: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="divide-y divide-border rounded-md border">
        {categories.length === 0 && <li className="p-3 text-sm text-muted-foreground">No {title.toLowerCase()} categories.</li>}
        {categories.map(c => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span className="text-sm">{c.icon && <span className="mr-1">{c.icon}</span>}{c.name}</span>
            <Button size="sm" variant="ghost" onClick={() => onArchive(c.id)}>Archive</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
