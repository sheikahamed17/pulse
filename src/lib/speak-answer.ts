export type SpokenAnswerInput =
  | {
      kind: 'money'
      mode: 'total' | 'breakdown' | 'delta' | 'series'
      direction: 'out' | 'in'
      categoryName: string | null
      periodLabel: string
      currency: string
      total?: number                                   // minor units (total/series)
      current?: number                                 // minor units (delta)
      deltaPct?: number | null                         // delta
      top?: { name: string | null; amount: number }[]  // breakdown (already sorted desc)
    }
  | { kind: 'task'; count: number; status: 'open' | 'overdue' | 'done' | 'all' }
  | { kind: 'learning'; count: number; search: string | null }
  | { kind: 'notes'; count: number; search: string | null }

const CURRENCY_WORD: Record<string, string> = {
  INR: 'rupees', USD: 'dollars', EUR: 'euros', GBP: 'pounds',
  AED: 'dirhams', SGD: 'Singapore dollars', JPY: 'yen', AUD: 'Australian dollars', CAD: 'Canadian dollars',
}
const ZERO_MINOR = new Set(['JPY'])

function money(amountMinor: number, currency: string): string {
  const major = amountMinor / (ZERO_MINOR.has(currency) ? 1 : 100)
  const num = major.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return `${num} ${CURRENCY_WORD[currency] ?? currency}`
}

const verb = (dir: 'out' | 'in') => (dir === 'out' ? 'spent' : 'received')
const noun = (dir: 'out' | 'in') => (dir === 'out' ? 'spending' : 'income')

export function speakableAnswer(input: SpokenAnswerInput): string {
  if (input.kind === 'money') {
    const on = input.categoryName ? ` on ${input.categoryName}` : ''
    if (input.mode === 'breakdown') {
      const top = (input.top ?? []).slice(0, 2)
      if (top.length === 0) return `No ${noun(input.direction)}${on} ${input.periodLabel}.`
      const parts = top.map(t => `${t.name ?? 'uncategorized'} ${money(t.amount, input.currency)}`)
      return `Top ${noun(input.direction)} ${input.periodLabel}: ${parts.join(', ')}.`
    }
    if (input.mode === 'delta') {
      const base = `You ${verb(input.direction)} ${money(input.current ?? 0, input.currency)}${on} ${input.periodLabel}`
      if (input.deltaPct == null) return `${base}.`
      const dir = input.deltaPct >= 0 ? 'up' : 'down'
      return `${base}, ${dir} ${Math.abs(Math.round(input.deltaPct))}% from the previous period.`
    }
    // total | series
    const amt = input.total ?? 0
    if (amt === 0) return `No ${noun(input.direction)}${on} ${input.periodLabel}.`
    const totalWord = input.mode === 'series' ? ' total' : ''
    return `You ${verb(input.direction)} ${money(amt, input.currency)}${on}${totalWord} ${input.periodLabel}.`
  }

  if (input.kind === 'task') {
    const label = input.status === 'open' ? 'open ' : input.status === 'overdue' ? 'overdue ' : input.status === 'done' ? 'completed ' : ''
    const nounw = input.count === 1 ? 'task' : 'tasks'
    if (input.count === 0) return `You have no ${label}${nounw}.`
    return `You have ${input.count} ${label}${nounw}.`
  }

  const topic = input.search ? ` about ${input.search}` : ''
  const nounw = input.kind === 'learning' ? (input.count === 1 ? 'learning' : 'learnings') : (input.count === 1 ? 'note' : 'notes')
  if (input.count === 0) return `No ${nounw}${topic} found.`
  if (input.kind === 'learning') return `${input.count} ${nounw}${topic}.`
  return `Found ${input.count} ${nounw}${topic}.`
}
