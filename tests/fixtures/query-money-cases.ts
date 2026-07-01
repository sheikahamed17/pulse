import type { QueryMoneyResponse } from '@/lib/agents/schemas/query-money-response'

export type QueryCase = {
  id: string
  text: string
  bucket: 'happy' | 'direction' | 'period' | 'category'
  expect: Partial<Pick<QueryMoneyResponse, 'direction' | 'category_name'>> & {
    periodLabel?: string
  }
}

export const QUERY_TEST_NOW_ISO = '2026-06-18T14:30:00.000Z'  // Thursday
export const QUERY_TEST_TZ = 'Asia/Kolkata'

export const QUERY_TEST_CATEGORIES = [
  { name: 'Food', kind: 'spend' as const },
  { name: 'Transport', kind: 'spend' as const },
  { name: 'Bills', kind: 'spend' as const },
  { name: 'Entertainment', kind: 'spend' as const },
  { name: 'Salary', kind: 'income' as const },
  { name: 'Freelance', kind: 'income' as const },
]

export const QUERY_CASES: QueryCase[] = [
  // ----- happy (8) -----
  { id: 'h-01', bucket: 'happy', text: 'how much did I spend last week',
    expect: { direction: 'out', category_name: null, periodLabel: 'last week' } },
  { id: 'h-02', bucket: 'happy', text: 'how much did I spend this month',
    expect: { direction: 'out', category_name: null, periodLabel: 'this month' } },
  { id: 'h-03', bucket: 'happy', text: 'what did I spend yesterday',
    expect: { direction: 'out', category_name: null, periodLabel: 'yesterday' } },
  { id: 'h-04', bucket: 'happy', text: 'show me my spending this year',
    expect: { direction: 'out', category_name: null, periodLabel: 'this year' } },
  { id: 'h-05', bucket: 'happy', text: 'how much have I earned this month',
    expect: { direction: 'in', category_name: null, periodLabel: 'this month' } },
  { id: 'h-06', bucket: 'happy', text: 'what was my income last year',
    expect: { direction: 'in', category_name: null, periodLabel: 'last year' } },
  { id: 'h-07', bucket: 'happy', text: 'spending today',
    expect: { direction: 'out', category_name: null, periodLabel: 'today' } },
  { id: 'h-08', bucket: 'happy', text: 'expenses last 7 days',
    expect: { direction: 'out', category_name: null, periodLabel: 'last 7 days' } },

  // ----- direction inference (4) -----
  { id: 'd-01', bucket: 'direction', text: 'how much did I get paid last month',
    expect: { direction: 'in' } },
  { id: 'd-02', bucket: 'direction', text: 'outgoing this week',
    expect: { direction: 'out' } },
  { id: 'd-03', bucket: 'direction', text: 'salary this year',
    expect: { direction: 'in' } },
  { id: 'd-04', bucket: 'direction', text: 'what did I receive last month',
    expect: { direction: 'in' } },

  // ----- period parsing (5) -----
  { id: 'p-01', bucket: 'period', text: 'how much in March',
    expect: { direction: 'out', periodLabel: 'in March' } },
  { id: 'p-02', bucket: 'period', text: 'spending in Q3',
    expect: { direction: 'out', periodLabel: 'Q3' } },
  { id: 'p-03', bucket: 'period', text: 'last 30 days',
    expect: { direction: 'out', periodLabel: 'last 30 days' } },
  { id: 'p-04', bucket: 'period', text: 'how much in 2025',
    expect: { direction: 'out', periodLabel: 'in 2025' } },
  { id: 'p-05', bucket: 'period', text: 'this week',
    expect: { direction: 'out', periodLabel: 'this week' } },

  // ----- category disambiguation (3) -----
  { id: 'c-01', bucket: 'category', text: 'how much on Food this month',
    expect: { direction: 'out', category_name: 'Food', periodLabel: 'this month' } },
  { id: 'c-02', bucket: 'category', text: 'spending on food last week',                  // case-insensitive match
    expect: { direction: 'out', category_name: 'Food' } },
  { id: 'c-03', bucket: 'category', text: 'how much on groceries last month',           // no exact-name match
    expect: { direction: 'out', category_name: null, periodLabel: 'last month' } },
]
