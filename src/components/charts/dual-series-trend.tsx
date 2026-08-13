'use client'

import { useMemo, useState } from 'react'
import { DIVERGING, SPEND_COLOR, INCOME_COLOR } from '@/lib/chart-palette'

interface DualSeriesTrendProps {
  spend: { label: string; amount: number }[]
  income: { label: string; amount: number }[]
  symbol: string
  jpy: boolean
}

export function DualSeriesTrend({ spend, income, symbol, jpy }: DualSeriesTrendProps) {
  const [showData, setShowData] = useState(false)

  const isEmpty = useMemo(() => spend.length === 0 && income.length === 0, [spend, income])

  const formatAmount = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const formatted = (amount / divisor).toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${symbol}${formatted}`
  }

  const formatSigned = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const value = amount / divisor
    const sign = value >= 0 ? '+' : ''
    const formatted = value.toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${sign}${formatted}`
  }

  // Align periods: merge spend and income by label
  const periods = useMemo(() => {
    const spendMap = new Map(spend.map((s) => [s.label, s.amount]))
    const incomeMap = new Map(income.map((i) => [i.label, i.amount]))
    const allLabels = Array.from(new Set([...spendMap.keys(), ...incomeMap.keys()]))

    return allLabels.map((label) => ({
      label,
      spend: spendMap.get(label) ?? 0,
      income: incomeMap.get(label) ?? 0,
    }))
  }, [spend, income])

  const maxAmount = useMemo(
    () => Math.max(0, ...periods.map((p) => Math.max(p.spend, p.income))),
    [periods],
  )

  const hasData = maxAmount > 0

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income vs Spend</p>
        <p className="text-xs text-muted-foreground italic">Not enough data yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income vs Spend</p>
        <button
          onClick={() => setShowData(!showData)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showData ? 'Hide' : 'Show'} data
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SPEND_COLOR }} />
          <span className="text-muted-foreground">Spend</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
          <span className="text-muted-foreground">Income</span>
        </div>
      </div>

      {showData ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-muted-foreground/20">
                <th className="text-left py-2 px-2 font-semibold">Period</th>
                <th className="text-right py-2 px-2 font-semibold">Spend</th>
                <th className="text-right py-2 px-2 font-semibold">Income</th>
                <th className="text-right py-2 px-2 font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const net = p.income - p.spend
                return (
                  <tr key={p.label} className="border-b border-muted-foreground/10 hover:bg-muted/30">
                    <td className="py-2 px-2 text-foreground">{p.label}</td>
                    <td className="py-2 px-2 text-right font-mono text-foreground">{formatAmount(p.spend)}</td>
                    <td className="py-2 px-2 text-right font-mono text-foreground">{formatAmount(p.income)}</td>
                    <td
                      className="py-2 px-2 text-right font-mono"
                      style={{ color: net >= 0 ? DIVERGING.positive : DIVERGING.negative }}
                    >
                      {formatSigned(net)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${Math.max(320, periods.length * 60)} 260`}
          className="w-full h-64"
          role="img"
          aria-label={`Income vs Spend: ${periods.map((p) => `${p.label} spend ${formatAmount(p.spend)} income ${formatAmount(p.income)}`).join(', ')}`}
        >
          {/* Y-axis baseline */}
          <line x1="30" y1="160" x2={Math.max(320, periods.length * 60) - 20} y2="160" stroke="currentColor" strokeWidth="1" opacity="0.2" />

          {/* Max value label and gridline */}
          {hasData && (
            <>
              <line
                x1="30"
                y1={20 + (1 - maxAmount / maxAmount) * 140}
                x2={Math.max(320, periods.length * 60) - 20}
                y2={20 + (1 - maxAmount / maxAmount) * 140}
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.1"
                strokeDasharray="2,2"
              />
              <text x={Math.max(320, periods.length * 60) - 25} y={15 + (1 - maxAmount / maxAmount) * 140} textAnchor="end" className="text-xs fill-muted-foreground" dy="0.3em">
                {formatAmount(maxAmount)}
              </text>
            </>
          )}

          {/* Bars grouped by period */}
          {periods.map((p, i) => {
            const barWidth = 12
            const gap = 2
            const groupWidth = barWidth * 2 + gap + 4 // 2 bars + gap + padding
            const spacing = Math.max(320, periods.length * 60) / periods.length
            const groupX = 30 + i * spacing + spacing / 2 - groupWidth / 2

            const spendHeight = hasData ? (p.spend / maxAmount) * 140 : 0
            const incomeHeight = hasData ? (p.income / maxAmount) * 140 : 0

            const spendY = 160 - spendHeight
            const incomeY = 160 - incomeHeight

            const net = p.income - p.spend
            const netSign = net >= 0 ? '+' : ''

            return (
              <g key={p.label}>
                {/* Spend bar */}
                <rect
                  x={groupX}
                  y={spendY}
                  width={barWidth}
                  height={spendHeight}
                  rx="4"
                  fill={SPEND_COLOR}
                  opacity="0.9"
                >
                  <title>{`${p.label} Spend: ${formatAmount(p.spend)}`}</title>
                </rect>

                {/* Income bar */}
                <rect
                  x={groupX + barWidth + gap}
                  y={incomeY}
                  width={barWidth}
                  height={incomeHeight}
                  rx="4"
                  fill={INCOME_COLOR}
                  opacity="0.9"
                >
                  <title>{`${p.label} Income: ${formatAmount(p.income)}`}</title>
                </rect>

                {/* Net indicator strip below */}
                <g>
                  <rect
                    x={groupX}
                    y="175"
                    width={barWidth * 2 + gap}
                    height="8"
                    fill={net >= 0 ? DIVERGING.positive : DIVERGING.negative}
                    opacity="0.6"
                    rx="1"
                  />
                  <text
                    x={groupX + (barWidth * 2 + gap) / 2}
                    y="190"
                    textAnchor="middle"
                    className="text-xs font-mono fill-muted-foreground"
                    dy="0.3em"
                  >
                    {netSign}{(net / (jpy ? 1 : 100)).toLocaleString('en-US', { maximumFractionDigits: jpy ? 0 : 2 })}
                  </text>
                </g>

                {/* Period label */}
                <text x={groupX + (barWidth * 2 + gap) / 2} y="220" textAnchor="middle" className="text-xs fill-muted-foreground" dy="0.3em">
                  {p.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
