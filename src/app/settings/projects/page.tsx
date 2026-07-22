'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useProjects } from '@/hooks/use-projects'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import type { ProjectRow } from '@/lib/dexie'

const PALETTE = ['#6f7bff', '#34e6ff', '#f97316', '#22c55e', '#e11d48', '#a855f7']

type WriteFn = (id: string, op: 'create' | 'update' | 'delete', payload: Record<string, unknown>) => void

export default function ProjectsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(PALETTE[0])

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const projects = useProjects(userId ?? undefined, true)

  const write: WriteFn = (entity_id, op_type, payload) => {
    if (!userId) return
    generateOp({ entity_kind: 'project', entity_id, op_type, payload, user_id: userId })
      .then(applyLocalOp)
      .then(() => pushPullOnce({ userId }))
      .catch(err => console.error('project write', err))
  }

  function addProject() {
    if (!newName.trim()) return
    write(crypto.randomUUID(), 'create', { name: newName.trim(), color: newColor, archived: 0 })
    setNewName('')
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <div className="flex gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New project…"
              onKeyDown={e => { if (e.key === 'Enter') addProject() }} />
            <Button onClick={addProject}>Add</Button>
          </div>
          <div className="flex gap-1.5">
            {PALETTE.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)} aria-label={`Color ${c}`}
                className={`h-6 w-6 rounded-full border-2 ${newColor === c ? 'border-foreground' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Your projects</h2>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
            {projects.length === 0 && <li className="p-3 text-sm text-muted-foreground">No projects yet.</li>}
            {projects.map(p => <ProjectRowItem key={p.id} project={p} onWrite={write} />)}
          </ul>
        </section>
      </main>
    </>
  )
}

function ProjectRowItem({ project, onWrite }: { project: ProjectRow; onWrite: WriteFn }) {
  const [name, setName] = useState(project.name)
  return (
    <li className={`flex flex-col gap-2 p-3 ${project.archived ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <Input value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== project.name) onWrite(project.id, 'update', { name: n }) }}
          aria-label="Project name" className="h-8 flex-1 text-sm" />
        <Button size="sm" variant="ghost" onClick={() => onWrite(project.id, 'update', { archived: project.archived ? 0 : 1 })}>
          {project.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onWrite(project.id, 'delete', {})}>Delete</Button>
      </div>
      <div className="flex gap-1.5">
        {PALETTE.map(c => (
          <button key={c} type="button" onClick={() => onWrite(project.id, 'update', { color: c })} aria-label={`Set color ${c}`}
            className={`h-5 w-5 rounded-full border-2 ${project.color === c ? 'border-foreground' : 'border-transparent'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
    </li>
  )
}
