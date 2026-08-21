'use client'

import { useMemo, useState } from 'react'
import { SEQUENTIAL_HUE, DIVERGING } from '@/lib/chart-palette'

interface NetWorthLineProps {
  data: { label: string; net: number }[]
  symbol: string
  jpy: boolean
}

export function NetWorthLine({ data, symbol, jpy }: NetWorthLineProps) {
  const [showData, setShowData] = useState(false)

  const isEmpty = useMemo(() => data.length <= 1, [data])

  const { minNet, maxNet } = useMemo(() => {
    if (data.length === 0) return { minNet: 0, maxNet: 0 }
    const nets = data.map((d) => d.net)
    return { minNet: Math.min(...nets), maxNet: Math.max(...nets) }
  }, [data])

  // Y-scale spans [min(0, minNet), max(0, maxNet)] to include zero
  const yMin = Math.min(0, minNet)
  const yMax = Math.max(0, maxNet)
  const yRange = yMax - yMin

  // Prevent division by zero for uniform scale
  const hasNegative = minNet < 0
  const hasPositive = maxNet > 0

  const formatNet = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const formatted = (amount / divisor).toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${symbol}${formatted}`
  }

  // SVG layout constants
  const padding = { top: 20, right: 25, bottom: 40, left: 30 }
  const width = Math.max(300, data.length * 40)
  const height = 240
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  // Calculate zero line y position (recessive baseline)
  const zeroLineY = yRange > 0 ? padding.top + plotHeight * ((yMax - 0) / yRange) : padding.top + plotHeight / 2

  // Points on the line
  const points = useMemo(() => {
    return data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * plotWidth
      const normalizedY = yRange > 0 ? (yMax - d.net) / yRange : 0.5
      const y = padding.top + normalizedY * plotHeight
      return { x, y, ...d, index: i }
    })
  }, [data, padding.left, padding.top, plotWidth, plotHeight, yRange, yMax])

  // Construct the path for the line
  const pathData = useMemo(() => {
    if (points.length === 0) return ''
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }, [points])

  // Area path (from line down to zero baseline)
  const areaPath = useMemo(() => {
    if (points.length === 0) return ''
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const returnPath = [...points].reverse().map((p, i) => `${i === 0 ? 'L' : 'L'} ${p.x} ${zeroLineY}`).join(' ')
    return linePath + ' ' + returnPath + ' Z'
  }, [points, zeroLineY])

  // Last point (emphasized)
  const lastPoint = points[points.length - 1]

  const xLabels = useMemo(() => {
    if (data.length <= 3) return data.map((d, i) => ({ i, label: d.label }))
    // For more than 3 points, thin out the labels
    const step = Math.ceil(data.length / 4)
    const labels: { i: number; label: string }[] = []
    data.forEach((d, i) => {
      if (i % step === 0) labels.push({ i, label: d.label })
    })
    return labels
  }, [data])

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net worth</p>
        <p className="text-xs text-muted-foreground italic">Not enough history yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net worth</p>
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
                <th className="text-right py-2 px-2 font-semibold">Net worth</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-muted-foreground/10 hover:bg-muted/30">
                  <td className="py-2 px-2 text-foreground">{d.label}</td>
                  <td
                    className="py-2 px-2 text-right font-mono"
                    style={{ color: d.net >= 0 ? DIVERGING.positive : DIVERGING.negative }}
                  >
                    {formatNet(d.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-64 min-w-max"
            role="img"
            aria-label={`Net worth trend: ${data.map((d) => `${d.label} ${formatNet(d.net)}`).join(', ')}`}
          >
            {/* Zero baseline (recessive when range crosses zero) */}
            {hasNegative && hasPositive && (
              <line
                x1={padding.left}
                y1={zeroLineY}
                x2={width - padding.right}
                y2={zeroLineY}
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.15"
              />
            )}

            {/* Y-axis gridlines and labels */}
            {yRange > 0 && (
              <>
                {/* Max value gridline */}
                <line
                  x1={padding.left}
                  y1={padding.top}
                  x2={width - padding.right}
                  y2={padding.top}
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.1"
                  strokeDasharray="2,2"
                />
                <text
                  x={width - padding.right - 5}
                  y={padding.top - 5}
                  textAnchor="end"
                  className="text-xs fill-muted-foreground"
                  dy="0.3em"
                >
                  {formatNet(maxNet)}
                </text>

                {/* Min value gridline */}
                <line
                  x1={padding.left}
                  y1={padding.top + plotHeight}
                  x2={width - padding.right}
                  y2={padding.top + plotHeight}
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.1"
                  strokeDasharray="2,2"
                />
                <text
                  x={width - padding.right - 5}
                  y={padding.top + plotHeight + 10}
                  textAnchor="end"
                  className="text-xs fill-muted-foreground"
                  dy="0.3em"
                >
                  {formatNet(yMin)}
                </text>
              </>
            )}

            {/* Area fill (subtle) */}
            <path d={areaPath} fill={SEQUENTIAL_HUE} opacity="0.08" />

            {/* Line */}
            <path d={pathData} fill="none" stroke={SEQUENTIAL_HUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Data points with hover titles */}
            {points.map((p) => (
              <circle
                key={p.index}
                cx={p.x}
                cy={p.y}
                r={p.index === points.length - 1 ? 5 : 2.5}
                fill={SEQUENTIAL_HUE}
                opacity={p.index === points.length - 1 ? 1 : 0.6}
                className="transition-all"
              >
                <title>{`${p.label}: ${formatNet(p.net)}`}</title>
              </circle>
            ))}

            {/* Last point marker (emphasized) */}
            {lastPoint && (
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="8"
                fill="none"
                stroke={SEQUENTIAL_HUE}
                strokeWidth="1.5"
                opacity="0.4"
              />
            )}

            {/* X-axis labels */}
            {xLabels.map((item) => {
              const p = points[item.i]
              return (
                <text
                  key={item.i}
                  x={p.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="text-xs fill-muted-foreground"
                  dy="0.3em"
                >
                  {item.label}
                </text>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}
