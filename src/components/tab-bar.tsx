'use client'

import { cn } from '@/lib/utils'
import type { Tab } from '@/hooks/use-tab-state'

type Props = {
  active: Tab
  onChange: (t: Tab) => void
  taskBadgeCount?: number      // overdue + open count; undefined = no badge
}

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'money', icon: '💸', label: 'Money' },
  { id: 'tasks', icon: '✅', label: 'Tasks' },
]

export function TabBar({ active, onChange, taskBadgeCount }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-background
                 md:static md:border-t-0 md:border-b"
      aria-label="Primary"
    >
      {TABS.map(t => {
        const isActive = active === t.id
        const showBadge = t.id === 'tasks' && taskBadgeCount !== undefined && taskBadgeCount > 0
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2 text-xs transition',
              'md:flex-row md:gap-2 md:py-3 md:text-sm',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="relative text-lg md:text-base">
              {t.icon}
              {showBadge && (
                <span className="absolute -right-2 -top-1 rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white tabular-nums">
                  {taskBadgeCount! > 9 ? '9+' : taskBadgeCount}
                </span>
              )}
            </span>
            <span>{t.label}</span>
            {isActive && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-foreground md:hidden" />}
          </button>
        )
      })}
    </nav>
  )
}
