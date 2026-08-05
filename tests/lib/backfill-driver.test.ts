import { describe, it, expect } from 'vitest'
import { runBackfill } from '@/lib/backfill-driver'

describe('runBackfill', () => {
  it('loops pages until done, accumulating totals', async () => {
    const pages = [
      { processed: 2, next_after: 'h2', done: false, errors: [] },
      { processed: 2, next_after: 'h4', done: false, errors: [{}] },
      { processed: 1, next_after: 'h5', done: true, errors: [] },
    ]
    let i = 0
    const r = await runBackfill(async () => pages[i++])
    expect(r).toEqual({ totalProcessed: 5, totalErrors: 1, completed: true, iterations: 3 })
  })
  it('stops at the iteration cap if never done (runaway guard)', async () => {
    const r = await runBackfill(async () => ({ processed: 1, next_after: 'h', done: false, errors: [] }), 5)
    expect(r.completed).toBe(false)
    expect(r.iterations).toBe(5)
  })
})
