'use client'

import { useState } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { cn } from '@/lib/utils'

type Props = {
  userId: string
  kind: 'spend' | 'income'
  selectedId: string | null
  onSelect: (id: string) => void
}

export function CategoryPicker({ userId, kind, selectedId, onSelect }: Props) {
  const categories = useCategories(userId, kind)
  const [query, setQuery] = useState('')

  const filtered = query
    ? categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search categories…"
        className="rounded-md border bg-background px-3 py-1 text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition',
              selectedId === c.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:bg-accent',
            )}
          >
            {c.icon && <span className="mr-1">{c.icon}</span>}{c.name}
          </button>
        ))}
        {filtered.length === 0 && <span className="text-xs text-muted-foreground">No matches.</span>}
      </div>
    </div>
  )
}
