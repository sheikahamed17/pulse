'use client'

import { createContext, useContext, useMemo } from 'react'
import { useUndoStack } from '@/hooks/use-undo-stack'

type UndoApi = { push: (label: string, undo: () => Promise<void>) => void }

const UndoContext = createContext<UndoApi | null>(null)

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const { entries, push, trigger, dismiss } = useUndoStack()
  const value = useMemo(() => ({ push }), [push])
  return (
    <UndoContext.Provider value={value}>
      {children}
      <div className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {entries.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-1.5 text-xs shadow">
            <span>{u.label}</span>
            <button type="button" className="font-semibold text-blue-600 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={() => trigger(u.id)}>Undo</button>
            <button type="button" aria-label="Dismiss" className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={() => dismiss(u.id)}>×</button>
          </div>
        ))}
      </div>
    </UndoContext.Provider>
  )
}
