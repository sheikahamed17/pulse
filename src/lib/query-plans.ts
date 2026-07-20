export type Period = { from: string; to: string; label: string }

export type QueryMoneyPlan = {
  kind: 'query_money'
  mode: 'total' | 'breakdown' | 'delta' | 'series'
  direction: 'out' | 'in'
  category_name: string | null
  period: Period
  bucket?: 'day' | 'week' | 'month'
}

export type QueryTaskPlan = {
  kind: 'query_task'
  status: 'open' | 'overdue' | 'done' | 'all'
  period: Period | null
}

export type QueryLearningPlan = {
  kind: 'query_learning'
  search: string | null
  tags: string[]
  period: Period | null
}

export type QueryNotesPlan = {
  kind: 'query_notes'
  search: string | null
  tags: string[]
  period: Period | null
}

export type QueryPlan = QueryMoneyPlan | QueryTaskPlan | QueryLearningPlan | QueryNotesPlan
