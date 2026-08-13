'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useCategories } from '@/hooks/use-categories'
import { useArchivedCategories } from '@/hooks/use-archived-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import type { CategoryRow } from '@/lib/dexie'

export default function CategoriesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
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
  const archived = useArchivedCategories(userId ?? undefined)

  async function addCategory() {
    if (!userId || !newName.trim()) return
    const sortOrder = (kind === 'spend' ? spend.length : income.length)
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: { name: newName.trim(), kind, sort_order: sortOrder, icon: newIcon.trim() || null },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewIcon('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function updateCategory(id: string, payload: Record<string, string | number | null>) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: id,
      op_type: 'update',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveCategory(id: string) {
    await updateCategory(id, { is_archived: 1 })
  }

  async function restoreCategory(id: string) {
    await updateCategory(id, { is_archived: 0 })
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Categories</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name…" maxLength={40} />
              <Input value={newIcon} onChange={e => setNewIcon(e.target.value)} placeholder="Icon" maxLength={8} className="w-14" />
            </div>
            <div className="flex gap-2">
              <select
                value={kind}
                onChange={e => setKind(e.target.value as 'spend' | 'income')}
                className="glass-soft rounded-lg border border-input px-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
              >
                <option value="spend">Spend</option>
                <option value="income">Income</option>
              </select>
              <Button onClick={addCategory} className="flex-1">Add</Button>
            </div>
          </div>
        </section>

        <CategorySection title="Spend" categories={spend} onArchive={archiveCategory} onUpdate={updateCategory} />
        <CategorySection title="Income" categories={income} onArchive={archiveCategory} onUpdate={updateCategory} />

        {archived.length > 0 && (
          <ArchivedSection archived={archived} onRestore={restoreCategory} />
        )}
      </main>
    </>
  )
}

function CategorySection({
  title, categories, onArchive, onUpdate,
}: {
  title: string
  categories: ReturnType<typeof useCategories>
  onArchive: (id: string) => void
  onUpdate: (id: string, payload: Record<string, string | number | null>) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')

  function startEdit(c: CategoryRow) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditIcon(c.icon ?? '')
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed) return
    await onUpdate(id, { name: trimmed, icon: editIcon.trim() || null })
    setEditingId(null)
  }

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <h2 className="text-sm font-semibold uppercase text-muted-foreground">{title}</h2>
      <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
        {categories.length === 0 && <li className="p-3 text-sm text-muted-foreground">No {title.toLowerCase()} categories.</li>}
        {categories.map(c => (
          <li key={c.id} className={`flex items-center justify-between ${editingId === c.id ? 'flex-col gap-2 py-3 px-3' : 'p-3'}`}>
            {editingId === c.id ? (
              <>
                <div className="flex w-full gap-2">
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Name…"
                    maxLength={40}
                    autoFocus
                    className="flex-1"
                  />
                  <Input
                    value={editIcon}
                    onChange={e => setEditIcon(e.target.value)}
                    placeholder="Icon"
                    maxLength={8}
                    className="w-14"
                  />
                </div>
                <div className="flex w-full gap-2">
                  <Button size="sm" onClick={() => saveEdit(c.id)} className="flex-1">Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="flex-1">Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm">{c.icon && <span className="mr-1">{c.icon}</span>}{c.name}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(c)} style={{ height: '44px', minWidth: '44px' }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => onArchive(c.id)} style={{ height: '44px', minWidth: '44px' }}>Archive</Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ArchivedSection({
  archived,
  onRestore,
}: {
  archived: ReturnType<typeof useArchivedCategories>
  onRestore: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between text-left text-sm font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Archived ({archived.length})</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
          {archived.map(c => (
            <li key={c.id} className="flex items-center justify-between p-3">
              <span className="text-sm">{c.icon && <span className="mr-1">{c.icon}</span>}{c.name}</span>
              <Button size="sm" variant="ghost" onClick={() => onRestore(c.id)} style={{ height: '44px', minWidth: '44px' }}>Restore</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
