'use client'

import { useMemo, useState } from 'react'
import type { Mover } from '@/lib/analytics'
import { DIVERGING } from '@/lib/chart-palette'

interface MoversBarsProps {
  movers: Mover[]
  symbol: string
  jpy: boolean
  limit?: number
}

export function MoversBars({ movers, symbol, jpy, limit = 8 }: MoversBarsProps) {
  const [showData, setShowData] = useState(false)

  const topMovers = useMemo(() => movers.slice(0, limit), [movers, limit])

  const formatSigned = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const value = amount / divisor
    const sign = value >= 0 ? '+' : ''
    const formatted = value.toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${sign}${symbol}${formatted}`
  }

  const isEmpty = topMovers.length === 0
  const maxDelta = useMemo(() => Math.max(0, ...topMovers.map((m) => Math.abs(m.delta))), [topMovers])
  const hasDelta = maxDelta > 0

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Movers</p>
        <p className="text-xs text-muted-foreground italic">No data yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Movers</p>
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
                <th className="text-right py-2 px-2 font-semibold">Delta</th>
                <th className="text-right py-2 px-2 font-semibold">% Change</th>
              </tr>
            </thead>
            <tbody>
              {topMovers.map((m) => (
                <tr key={m.name} className="border-b border-muted-foreground/10 hover:bg-muted/30">
                  <td className="py-2 px-2 text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {m.icon && <span>{m.icon}</span>}
                      {m.name}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-foreground">{formatSigned(m.delta)}</td>
                  <td
                    className="py-2 px-2 text-right font-mono"
                    style={{ color: m.deltaPct === null ? '#999' : m.delta > 0 ? DIVERGING.negative : DIVERGING.positive }}
                  >
                    {m.deltaPct === null ? '−' : `${m.delta > 0 ? '+' : ''}${m.deltaPct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 600 ${Math.max(200, topMovers.length * 40)}`}
          className="w-full h-auto"
          style={{ minHeight: `${Math.max(200, topMovers.length * 40)}px` }}
          role="img"
          aria-label={`Top movers: ${topMovers.map((m) => `${m.name} ${formatSigned(m.delta)}`).join(', ')}`}
        >
          {/* Center line (zero) */}
          <line x1="150" y1="0" x2="150" y2={topMovers.length * 40} stroke="currentColor" strokeWidth="1" opacity="0.2" />

          {topMovers.map((m, i) => {
            const y = i * 40 + 20
            const barLength = hasDelta ? (Math.abs(m.delta) / maxDelta) * 130 : 0
            const barColor = m.delta > 0 ? DIVERGING.negative : DIVERGING.positive
            const barStartX = m.delta > 0 ? 150 : 150 - barLength
            const isIncrease = m.delta > 0

            const arrowChar = isIncrease ? '↑' : '↓'

            return (
              <g key={m.name}>
                {/* Bar */}
                {barLength > 0 && (
                  <rect
                    x={barStartX}
                    y={y - 6}
                    width={barLength}
                    height={12}
                    rx="4"
                    fill={barColor}
                    opacity="0.8"
                  >
                    <title>{`${m.name}: ${formatSigned(m.delta)} (${m.deltaPct === null ? '−' : `${m.delta > 0 ? '+' : ''}${m.deltaPct.toFixed(1)}%`})`}</title>
                  </rect>
                )}

                {/* Left label: arrow + icon + name */}
                <text x="8" y={y} textAnchor="start" className="text-xs fill-muted-foreground font-mono" dy="0.3em">
                  {arrowChar}
                </text>
                {m.icon && (
                  <text x="22" y={y} textAnchor="start" className="text-xs" dy="0.3em">
                    {m.icon}
                  </text>
                )}
                <text x={m.icon ? '38' : '30'} y={y} textAnchor="start" className="text-xs fill-foreground" dy="0.3em">
                  {m.name}
                </text>

                {/* Right label: amount + percent */}
                <text x="290" y={y} textAnchor="start" className="text-xs fill-foreground font-mono" dy="0.3em">
                  {formatSigned(m.delta)}
                </text>
                <text
                  x="360"
                  y={y}
                  textAnchor="start"
                  className="text-xs font-mono"
                  style={{ fill: m.deltaPct === null ? '#999' : 'inherit' }}
                  dy="0.3em"
                >
                  ({m.deltaPct === null ? '−' : `${m.delta > 0 ? '+' : ''}${m.deltaPct.toFixed(1)}%`})
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
