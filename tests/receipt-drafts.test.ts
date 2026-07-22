import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb, type ReceiptDraftRow } from '@/lib/dexie'
import { saveReceiptDraft, listReceiptDrafts, deleteReceiptDraft, pickNextReceiptDraft } from '@/lib/receipt-drafts'
import type { MoneyPayload } from '@/lib/op-schemas/money'

const payload = (over: Partial<MoneyPayload> = {}): MoneyPayload => ({
  amount: 45000, currency: 'INR', direction: 'out',
  category_id: null, description: 'Starbucks',
  occurred_at: '2026-07-21T10:00:00.000Z', source: 'receipt',
  receipt_key: 'u1/abc.jpg', raw_input: '<receipt> Starbucks', ...over,
})

const row = (id: string, created_at: string, over: Partial<MoneyPayload> = {}): ReceiptDraftRow => ({
  id, created_at, payload: payload(over),
})

describe('receipt-drafts', () => {
  beforeEach(async () => { await resetDb() })

  it('saves a draft with the payload + created_at and returns its id', async () => {
    const id = await saveReceiptDraft(payload())
    const saved = await db.receipt_drafts.get(id)
    expect(saved?.payload.receipt_key).toBe('u1/abc.jpg')
    expect(saved?.created_at).toBeTruthy()
  })

  it('lists drafts oldest-first', async () => {
    await db.receipt_drafts.put(row('b', '2026-07-21T12:00:00.000Z'))
    await db.receipt_drafts.put(row('a', '2026-07-21T09:00:00.000Z'))
    expect((await listReceiptDrafts()).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('deletes a draft by id', async () => {
    const id = await saveReceiptDraft(payload())
    await deleteReceiptDraft(id)
    expect(await db.receipt_drafts.get(id)).toBeUndefined()
  })

  describe('pickNextReceiptDraft (pure)', () => {
    it('returns null for an empty list', () => {
      expect(pickNextReceiptDraft([])).toBeNull()
    })
    it('returns the oldest by created_at', () => {
      expect(pickNextReceiptDraft([
        row('x', '2026-07-21T12:00:00.000Z'),
        row('y', '2026-07-21T08:00:00.000Z'),
      ])?.id).toBe('y')
    })
    it('breaks created_at ties by id', () => {
      const t = '2026-07-21T08:00:00.000Z'
      expect(pickNextReceiptDraft([row('zzz', t), row('aaa', t)])?.id).toBe('aaa')
    })
  })

  it('round-trips: pick oldest → delete → next → delete → null', async () => {
    await db.receipt_drafts.put(row('1', '2026-07-21T08:00:00.000Z', { description: 'first' }))
    await db.receipt_drafts.put(row('2', '2026-07-21T09:00:00.000Z', { description: 'second' }))
    let next = pickNextReceiptDraft(await listReceiptDrafts())
    expect(next?.payload.description).toBe('first')
    await deleteReceiptDraft(next!.id)
    next = pickNextReceiptDraft(await listReceiptDrafts())
    expect(next?.payload.description).toBe('second')
    await deleteReceiptDraft(next!.id)
    expect(pickNextReceiptDraft(await listReceiptDrafts())).toBeNull()
  })
})
