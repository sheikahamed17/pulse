import { describe, it, expect } from 'vitest'
import { blankDraftForKind } from '@/lib/blank-draft'

const NOW = '2026-08-04T10:00:00.000Z'

describe('blankDraftForKind', () => {
  it('money: zero amount, primary currency, out, manual, dated now', () => {
    const d = blankDraftForKind('money', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'money', amount: 0, currency: 'INR', direction: 'out', category_id: null, description: null, merchant: null, tags: [], occurred_at: NOW, source: 'manual' })
  })
  it('task: empty title, medium, empty tags, manual', () => {
    const d = blankDraftForKind('task', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'task', title: '', priority: 'medium', tags: [], due_at: null, project_id: null, source: 'manual' })
  })
  it('learning: empty text, manual, dated now', () => {
    const d = blankDraftForKind('learning', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'learning', text: '', tags: [], attribution: null, occurred_at: NOW, source: 'manual' })
  })
  it('note: empty body, null title, manual, dated now', () => {
    const d = blankDraftForKind('note', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'note', body: '', title: null, tags: [], occurred_at: NOW, source: 'manual' })
  })
})
