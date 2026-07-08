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
        className="glass-soft rounded-md px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'glass-soft rounded-md px-2.5 py-1 text-xs transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
              selectedId === c.id
                ? 'bg-[linear-gradient(150deg,rgb(111_123_255/.35),rgb(52_230_255/.22))] border border-[rgb(120_190_255/.4)] text-accent-2'
                : 'hover:border-accent-2/50',
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
