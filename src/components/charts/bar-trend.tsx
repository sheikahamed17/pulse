'use client'

import { useMemo, useState } from 'react'
import { SEQUENTIAL_HUE } from '@/lib/chart-palette'

interface BarTrendProps {
  data: { label: string; amount: number }[]
  symbol: string
  jpy: boolean
  label: string
}

export function BarTrend({ data, symbol, jpy, label }: BarTrendProps) {
  const [showData, setShowData] = useState(false)

  const isEmpty = useMemo(() => data.length <= 1, [data])
  const maxAmount = useMemo(() => Math.max(0, ...data.map((d) => d.amount)), [data])
  const hasData = maxAmount > 0

  const formatAmount = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const formatted = (amount / divisor).toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${symbol}${formatted}`
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground italic">Not enough data yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
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
                <th className="text-left py-2 px-2 font-semibold">Period</th>
                <th className="text-right py-2 px-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-muted-foreground/10 hover:bg-muted/30">
                  <td className="py-2 px-2 text-foreground">{d.label}</td>
                  <td className="py-2 px-2 text-right font-mono text-foreground">{formatAmount(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${Math.max(300, data.length * 32)} 200`}
          className="w-full h-48"
          role="img"
          aria-label={`${label}: ${data.map((d) => `${d.label} ${formatAmount(d.amount)}`).join(', ')}`}
        >
          {/* Baseline */}
          <line x1="20" y1="160" x2={Math.max(300, data.length * 32) - 20} y2="160" stroke="currentColor" strokeWidth="1" opacity="0.2" />

          {/* Max value label and gridline */}
          {hasData && (
            <>
              <line x1="20" y1={20 + (1 - maxAmount / maxAmount) * 140} x2={Math.max(300, data.length * 32) - 20} y2={20 + (1 - maxAmount / maxAmount) * 140} stroke="currentColor" strokeWidth="1" opacity="0.1" strokeDasharray="2,2" />
              <text x={Math.max(300, data.length * 32) - 25} y={15 + (1 - maxAmount / maxAmount) * 140} textAnchor="end" className="text-xs fill-muted-foreground" dy="0.3em">
                {formatAmount(maxAmount)}
              </text>
            </>
          )}

          {/* Bars */}
          {data.map((d, i) => {
            const barWidth = 20
            const spacing = Math.max(300, data.length * 32) / data.length
            const x = 20 + i * spacing + spacing / 2 - barWidth / 2
            const barHeight = hasData ? (d.amount / maxAmount) * 140 : 0
            const y = 160 - barHeight
            const isLatest = i === data.length - 1

            return (
              <g key={d.label}>
                {/* Bar with rounded top */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="4"
                  fill={SEQUENTIAL_HUE}
                  opacity={isLatest ? 1 : 0.75}
                  className="transition-opacity"
                >
                  <title>{`${d.label}: ${formatAmount(d.amount)}`}</title>
                </rect>

                {/* Label */}
                <text x={x + barWidth / 2} y="175" textAnchor="middle" className="text-xs fill-muted-foreground" dy="0.3em">
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
