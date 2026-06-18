'use client'

import { cn } from '@/lib/utils'

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

type Props = {
  period: Period
  intervalCount: number
  onChange: (period: Period, intervalCount: number) => void
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
]

export function PeriodPicker({ period, intervalCount, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-2">
      <div className="flex gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value, intervalCount)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-xs',
              p.value === period ? 'bg-foreground text-background' : 'hover:bg-accent',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between text-xs">
        <span>every</span>
        <input
          type="number"
          min={1}
          max={365}
          value={intervalCount}
          onChange={e => onChange(period, Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-16 rounded-md border bg-background px-2 py-0.5 text-right"
        />
        <span className="text-muted-foreground">{period === 'daily' ? 'day(s)' : period === 'weekly' ? 'week(s)' : period === 'monthly' ? 'month(s)' : 'year(s)'}</span>
      </label>
    </div>
  )
}
