import { describe, it, expect } from 'vitest'
import { speakableAnswer } from '@/lib/speak-answer'

describe('speakableAnswer — money', () => {
  it('total (spend)', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'out', categoryName: 'Food', periodLabel: 'last month', currency: 'INR', total: 800000 }))
      .toBe('You spent 8,000 rupees on Food last month.')
  })
  it('total income, no category', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'in', categoryName: null, periodLabel: 'this month', currency: 'USD', total: 500000 }))
      .toBe('You received 5,000 dollars this month.')
  })
  it('total zero → empty phrasing', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'out', categoryName: 'Food', periodLabel: 'today', currency: 'INR', total: 0 }))
      .toBe('No spending on Food today.')
  })
  it('JPY has no minor units', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'total', direction: 'out', categoryName: null, periodLabel: 'this week', currency: 'JPY', total: 5000 }))
      .toBe('You spent 5,000 yen this week.')
  })
  it('delta up', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'delta', direction: 'out', categoryName: null, periodLabel: 'this month', currency: 'INR', current: 800000, deltaPct: 12 }))
      .toBe('You spent 8,000 rupees this month, up 12% from the previous period.')
  })
  it('delta with null pct (previous was zero)', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'delta', direction: 'out', categoryName: null, periodLabel: 'this month', currency: 'INR', current: 800000, deltaPct: null }))
      .toBe('You spent 8,000 rupees this month.')
  })
  it('breakdown names top categories', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'breakdown', direction: 'out', categoryName: null, periodLabel: 'last month', currency: 'INR', top: [{ name: 'Food', amount: 800000 }, { name: 'Transport', amount: 300000 }] }))
      .toBe('Top spending last month: Food 8,000 rupees, Transport 3,000 rupees.')
  })
  it('series summarizes the total', () => {
    expect(speakableAnswer({ kind: 'money', mode: 'series', direction: 'out', categoryName: null, periodLabel: 'this year', currency: 'INR', total: 1200000 }))
      .toBe('You spent 12,000 rupees total this year.')
  })
})

describe('speakableAnswer — lists', () => {
  it('open tasks plural', () => {
    expect(speakableAnswer({ kind: 'task', count: 3, status: 'open' })).toBe('You have 3 open tasks.')
  })
  it('overdue singular', () => {
    expect(speakableAnswer({ kind: 'task', count: 1, status: 'overdue' })).toBe('You have 1 overdue task.')
  })
  it('no open tasks', () => {
    expect(speakableAnswer({ kind: 'task', count: 0, status: 'open' })).toBe('You have no open tasks.')
  })
  it('learnings with topic', () => {
    expect(speakableAnswer({ kind: 'learning', count: 5, search: 'Rust' })).toBe('5 learnings about Rust.')
  })
  it('notes none found', () => {
    expect(speakableAnswer({ kind: 'notes', count: 0, search: 'wifi' })).toBe('No notes about wifi found.')
  })
  it('notes plural no topic', () => {
    expect(speakableAnswer({ kind: 'notes', count: 2, search: null })).toBe('Found 2 notes.')
  })
})
