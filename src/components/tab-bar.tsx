'use client'

import { BookOpen, CheckSquare, NotebookPen, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tab } from '@/hooks/use-tab-state'

type Props = {
  active: Tab
  onChange: (t: Tab) => void
  taskBadgeCount?: number      // overdue + open count; undefined = no badge
}

const TABS: { id: Tab; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'money', icon: Wallet, label: 'Money' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'learning', icon: BookOpen, label: 'Learn' },
  { id: 'notes', icon: NotebookPen, label: 'Notes' },
]

export function TabBar({ active, onChange, taskBadgeCount }: Props) {
  return (
    <>
      {/* Desktop: segmented glass control at top */}
      <nav
        className="hidden md:flex fixed top-0 left-0 right-0 z-40 gap-1 px-2 pb-2 pt-[calc(0.5rem_+_env(safe-area-inset-top))] border-b glass"
        aria-label="Primary"
      >
        {TABS.map(t => {
          const isActive = active === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
                isActive
                  ? 'bg-[linear-gradient(150deg,rgb(111_123_255/.35),rgb(52_230_255/.22))] border border-[rgb(120_190_255/.4)] text-foreground drop-shadow-[0_0_12px_rgb(52_230_255/.3)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Mobile: floating glass dock at bottom */}
      <nav
        className="md:hidden fixed bottom-[calc(1rem_+_env(safe-area-inset-bottom))] left-4 right-4 z-40 flex gap-2 p-3 rounded-2xl glass"
        aria-label="Primary"
      >
        {TABS.map(t => {
          const isActive = active === t.id
          const Icon = t.icon
          const showBadge = t.id === 'tasks' && taskBadgeCount !== undefined && taskBadgeCount > 0
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 min-h-[44px] transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded-lg"
            >
              <span className="relative">
                <Icon
                  className={cn(
                    'w-6 h-6 transition',
                    isActive
                      ? 'text-accent-2 drop-shadow-[0_0_8px_rgb(52_230_255/.6)]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                />
                {showBadge && (
                  <span className={cn(
                    'absolute -right-2 -top-2 rounded-md px-1 py-0.5 text-[10px] font-mono font-semibold tabular-nums',
                    'bg-warning text-[#211500]',
                  )}>
                    {taskBadgeCount! > 9 ? '9+' : taskBadgeCount}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{t.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
