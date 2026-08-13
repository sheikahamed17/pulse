'use client'

import { useMemo, useState } from 'react'
import type { CategorySeries, Period } from '@/lib/analytics'
import { CATEGORICAL, DIVERGING } from '@/lib/chart-palette'

// Color follows the ENTITY, not its rank: hash the (stable) category name to a
// fixed CATEGORICAL slot so a category keeps its hue when its rank changes
// (e.g. on the week/month toggle). "Other" is always the neutral gray.
function categoricalColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return CATEGORICAL[Math.abs(h) % CATEGORICAL.length]
}

interface CategorySmallMultiplesProps {
  series: CategorySeries[]
  periods: Period[]
  symbol: string
  jpy: boolean
}

export function CategorySmallMultiples({ series, periods, symbol, jpy }: CategorySmallMultiplesProps) {
  const [showData, setShowData] = useState(false)

  const isEmpty = series.length === 0

  const formatAmount = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const formatted = (amount / divisor).toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${symbol}${formatted}`
  }

  // Compute shared y-scale: max bar value across all series and periods
  const maxValue = useMemo(() => {
    let max = 0
    for (const s of series) {
      for (const point of s.points) {
        max = Math.max(max, point)
      }
    }
    return max
  }, [series])

  const hasData = maxValue > 0

  // Build flat table data for fallback
  const tableData = useMemo(() => {
    const rows: Array<{ categoryName: string; categoryIcon: string | null; periodLabel: string; amount: number }> = []
    for (const s of series) {
      for (let i = 0; i < periods.length; i++) {
        rows.push({
          categoryName: s.name,
          categoryIcon: s.icon,
          periodLabel: periods[i].label,
          amount: s.points[i],
        })
      }
    }
    return rows
  }, [series, periods])

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spending by Category</p>
        <p className="text-xs text-muted-foreground italic">No data yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spending by Category</p>
        <button
          onClick={() => setShowData(!showData)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showData ? 'Hide' : 'Show'} data
        </button>
      </div>

      {showData ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-muted-foreground/20">
                <th className="text-left py-2 px-2 font-semibold">Category</th>
                <th className="text-left py-2 px-2 font-semibold">Period</th>
                <th className="text-right py-2 px-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={`${row.categoryName}-${row.periodLabel}-${idx}`} className="border-b border-muted-foreground/10 hover:bg-muted/30">
                  <td className="py-2 px-2 text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {row.categoryIcon && <span>{row.categoryIcon}</span>}
                      {row.categoryName}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-foreground text-muted-foreground">{row.periodLabel}</td>
                  <td className="py-2 px-2 text-right font-mono text-foreground">{formatAmount(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-4 min-w-min" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))` }}>
            {series.map((s) => {
              const color = s.name === 'Other' ? DIVERGING.neutral : categoricalColor(s.name)
              const seriesTotal = s.points.reduce((sum, p) => sum + p, 0)

              return (
                <svg
                  key={s.name}
                  viewBox={`0 0 140 180`}
                  className="w-full h-auto"
                  style={{ minWidth: '140px', minHeight: '180px' }}
                  role="img"
                  aria-label={`${s.name}: ${formatAmount(seriesTotal)} total`}
                >
                  {/* Title with icon and total */}
                  <text x="70" y="12" textAnchor="middle" className="text-xs font-semibold fill-foreground" dy="0.3em">
                    {s.icon && <tspan>{s.icon} </tspan>}
                    {s.name}
                  </text>
                  <text x="70" y="26" textAnchor="middle" className="text-xs fill-muted-foreground" dy="0.3em">
                    {formatAmount(seriesTotal)}
                  </text>

                  {/* Baseline */}
                  <line x1="15" y1="140" x2="125" y2="140" stroke="currentColor" strokeWidth="1" opacity="0.2" />

                  {/* Bars */}
                  {s.points.map((point, barIdx) => {
                    const barWidth = 100 / s.points.length - 2
                    const barX = 15 + barIdx * (100 / s.points.length) + (100 / s.points.length - barWidth) / 2
                    const barHeight = hasData ? (point / maxValue) * 110 : 0
                    const barY = 140 - barHeight

                    return (
                      <g key={`${s.name}-${barIdx}`}>
                        <rect
                          x={barX}
                          y={barY}
                          width={barWidth}
                          height={barHeight}
                          rx="4"
                          fill={color}
                          opacity="0.85"
                        >
                          <title>{`${periods[barIdx].label}: ${formatAmount(point)}`}</title>
                        </rect>
                      </g>
                    )
                  })}

                  {/* Period labels */}
                  {s.points.map((_, barIdx) => {
                    const barWidth = 100 / s.points.length - 2
                    const barX = 15 + barIdx * (100 / s.points.length) + (100 / s.points.length - barWidth) / 2
                    return (
                      <text
                        key={`label-${barIdx}`}
                        x={barX + barWidth / 2}
                        y="158"
                        textAnchor="middle"
                        className="text-xs fill-muted-foreground"
                        dy="0.3em"
                      >
                        {periods[barIdx].label}
                      </text>
                    )
                  })}
                </svg>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
