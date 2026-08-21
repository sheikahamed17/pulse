'use client'

import { useMemo } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { MoneyFilter, MoneySort } from '@/lib/money-filter-sort'
import { monthBounds } from '@/lib/money-filter-sort'

type Props = {
  userId: string
  filter: MoneyFilter
  sort: MoneySort
  onFilter: (filter: MoneyFilter) => void
  onSort: (sort: MoneySort) => void
}

export function MoneyControls({ userId, filter, sort, onFilter, onSort }: Props) {
  const allCats = useCategories(userId)
  const entries = useMoneyEntries(userId)

  const spendCats = useMemo(() => allCats.filter(c => c.kind === 'spend'), [allCats])
  const incomeCats = useMemo(() => allCats.filter(c => c.kind === 'income'), [allCats])

  const distinctTags = useMemo(() => {
    const tags = new Set<string>()
    entries.forEach(e => {
      ;(e.tags ?? []).forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [entries])

  const sources: Array<MoneyEntryRow['source'] | 'all'> = ['all', 'manual', 'voice', 'receipt', 'sms', 'email', 'recurring']

  // Month bounds: current and previous month. Read the clock inside useMemo (not
  // the render body) to satisfy react-hooks/purity; mount-stable is fine here
  // (a session spanning a UTC month rollover is rare and only affects which
  // date-range option shows as selected).
  const currentMonthBounds = useMemo(() => monthBounds(new Date().getTime(), 0), [])
  const previousMonthBounds = useMemo(() => monthBounds(new Date().getTime(), 1), [])

  const handleDateRangeChange = (range: 'this-month' | 'last-month' | 'all') => {
    if (range === 'this-month') {
      onFilter({ ...filter, from: currentMonthBounds.from, to: currentMonthBounds.to })
    } else if (range === 'last-month') {
      onFilter({ ...filter, from: previousMonthBounds.from, to: previousMonthBounds.to })
    } else {
      onFilter({ ...filter, from: null, to: null })
    }
  }

  const currentDateRange =
    filter.from === currentMonthBounds.from && filter.to === currentMonthBounds.to
      ? 'this-month'
      : filter.from === previousMonthBounds.from && filter.to === previousMonthBounds.to
        ? 'last-month'
        : 'all'

  return (
    <div className="flex flex-col gap-2 flex-wrap md:flex-row md:items-end">
      <select
        value={filter.categoryName ?? ''}
        onChange={e => onFilter({ ...filter, categoryName: e.target.value === '' ? null : e.target.value === '__UNCATEGORIZED__' ? 'Uncategorized' : e.target.value })}
        className="min-h-[44px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      >
        <option value="">All categories</option>
        <option value="__UNCATEGORIZED__">Uncategorized</option>
        {spendCats.length > 0 && (
          <optgroup label="Spend">
            {spendCats.map(c => (
              <option key={c.id} value={c.name}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </option>
            ))}
          </optgroup>
        )}
        {incomeCats.length > 0 && (
          <optgroup label="Income">
            {incomeCats.map(c => (
              <option key={c.id} value={c.name}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <select
        value={filter.source ?? ''}
        onChange={e => onFilter({ ...filter, source: e.target.value === '' ? null : (e.target.value as MoneyEntryRow['source']) })}
        className="min-h-[44px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      >
        <option value="">All sources</option>
        {sources.map(s => {
          if (s === 'all') return null
          return (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          )
        })}
      </select>

      <select
        value={filter.tag ?? ''}
        onChange={e => onFilter({ ...filter, tag: e.target.value === '' ? null : e.target.value })}
        className="min-h-[44px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      >
        <option value="">All tags</option>
        {distinctTags.map(tag => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>

      <div className="flex gap-1">
        {(['all', 'out', 'in'] as const).map(d => (
          <button
            key={d}
            onClick={() => onFilter({ ...filter, direction: d === 'all' ? null : d })}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-sm transition-colors ${
              (d === 'all' && filter.direction === null) || (d !== 'all' && filter.direction === d)
                ? 'bg-accent-2 text-background'
                : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
            }`}
          >
            {d === 'all' ? 'All' : d === 'out' ? 'Spent' : 'Earned'}
          </button>
        ))}
      </div>

      <select
        value={sort}
        onChange={e => onSort(e.target.value as MoneySort)}
        className="min-h-[44px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      >
        <option value="date-desc">Newest</option>
        <option value="date-asc">Oldest</option>
        <option value="amount-desc">Amount ↓</option>
        <option value="amount-asc">Amount ↑</option>
      </select>

      <select
        value={currentDateRange}
        onChange={e => handleDateRangeChange(e.target.value as 'this-month' | 'last-month' | 'all')}
        className="min-h-[44px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      >
        <option value="all">All time</option>
        <option value="this-month">This month</option>
        <option value="last-month">Last month</option>
      </select>
    </div>
  )
}
