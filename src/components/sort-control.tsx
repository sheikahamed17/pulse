'use client'

/** Generic labeled sort control. */
export function SortControl<T extends string>({
  options,
  value,
  onChange,
  label = 'Sort',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-2 min-h-[44px]">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="rounded-lg bg-accent/20 px-3 py-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
