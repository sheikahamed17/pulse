import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyOp } from '@/lib/op-log'
import { generateOp, applyLocalOp } from '@/lib/sync-client'
import type { TransferPayload } from '@/lib/op-schemas/transfer'
import type { Op, EntityRow } from '@/types/ops'
import { db, resetDb } from '@/lib/dexie'

// Setup fake Cloudflare D1 for materialize tests
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
})

describe('transfer round-trip (client + server)', () => {
  const userId = 'test-user-123'
  const transferId = 'transfer-001'
  const fromAccountId = 'account-001'
  const toAccountId = 'account-002'

  beforeEach(async () => {
    await resetDb()
  })

  describe('client-side (applyLocalOp + Dexie)', () => {
    it('create: from/to/amount/currency/occurred_at persisted to Dexie', async () => {
      const payload: TransferPayload = {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: 50000,
        currency: 'INR',
        occurred_at: '2026-08-24T10:00:00Z',
        note: null,
      }

      const op = await generateOp({
        entity_kind: 'transfer',
        entity_id: transferId,
        op_type: 'create',
        payload,
        user_id: userId,
      })

      await applyLocalOp(op)

      const row = await db.transfers.get(transferId)
      expect(row).toBeDefined()
      expect(row?.from_account_id).toBe(fromAccountId)
      expect(row?.to_account_id).toBe(toAccountId)
      expect(row?.amount).toBe(50000)
      expect(row?.currency).toBe('INR')
      expect(row?.occurred_at).toBe('2026-08-24T10:00:00Z')
      expect(row?.note).toBeNull()
      expect(row?.deleted_at).toBeNull()
    })

    it('update: only-note changes leave amount unchanged', async () => {
      const payload: TransferPayload = {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: 50000,
        currency: 'INR',
        occurred_at: '2026-08-24T10:00:00Z',
        note: null,
      }

      const createOp = await generateOp({
        entity_kind: 'transfer',
        entity_id: transferId,
        op_type: 'create',
        payload,
        user_id: userId,
      })

      await applyLocalOp(createOp)

      const updateOp = await generateOp({
        entity_kind: 'transfer',
        entity_id: transferId,
        op_type: 'update',
        payload: { note: 'Savings contribution' },
        user_id: userId,
      })

      await applyLocalOp(updateOp)

      const row = await db.transfers.get(transferId)
      expect(row?.amount).toBe(50000) // unchanged
      expect(row?.from_account_id).toBe(fromAccountId) // unchanged
      expect(row?.to_account_id).toBe(toAccountId) // unchanged
      expect(row?.note).toBe('Savings contribution') // updated
    })
  })

  describe('applyOp (per-field LWW)', () => {
    it('create op produces all fields with correct HLCs', () => {
      const payload: TransferPayload = {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: 50000,
        currency: 'INR',
        occurred_at: '2026-08-24T10:00:00Z',
        note: 'Test note',
      }

      const op: Op = {
        id: 'op-id-001',
        hlc: '1693036800000-000000-test-device',
        device_id: 'test-device',
        user_id: userId,
        entity_kind: 'transfer',
        entity_id: transferId,
        op_type: 'create',
        payload,
        schema_version: 1,
      }

      const row = applyOp(undefined, op)

      expect(row.id).toBe(transferId)
      expect(row.user_id).toBe(userId)
      expect(row.from_account_id).toBe(fromAccountId)
      expect(row.to_account_id).toBe(toAccountId)
      expect(row.amount).toBe(50000)
      expect(row.currency).toBe('INR')
      expect(row.occurred_at).toBe('2026-08-24T10:00:00Z')
      expect(row.note).toBe('Test note')
      expect(row.deleted_at).toBeNull()
      expect(row.field_hlcs).toHaveProperty('from_account_id')
      expect(row.field_hlcs).toHaveProperty('to_account_id')
      expect(row.field_hlcs).toHaveProperty('amount')
      expect(row.field_hlcs).toHaveProperty('currency')
      expect(row.field_hlcs).toHaveProperty('occurred_at')
      expect(row.field_hlcs).toHaveProperty('note')
    })

    it('update op merges with LWW (later HLC wins)', () => {
      const createPayload: TransferPayload = {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: 50000,
        currency: 'INR',
        occurred_at: '2026-08-24T10:00:00Z',
        note: 'Original',
      }

      const createOp: Op = {
        id: 'op-id-001',
        hlc: '1693036800000-000000-test-device',
        device_id: 'test-device',
        user_id: userId,
        entity_kind: 'transfer',
        entity_id: transferId,
        op_type: 'create',
        payload: createPayload,
        schema_version: 1,
      }

      let row = applyOp(undefined, createOp)

      const updateOp: Op = {
        id: 'op-id-002',
        hlc: '1693036800001-000000-test-device',
        device_id: 'test-device',
        user_id: userId,
        entity_kind: 'transfer',
        entity_id: transferId,
        op_type: 'update',
        payload: { note: 'Updated note' },
        schema_version: 1,
      }

      row = applyOp(row as EntityRow, updateOp)

      expect(row.amount).toBe(50000) // unchanged from create
      expect(row.note).toBe('Updated note') // updated
      expect(row.field_hlcs.note).toBe(updateOp.hlc)
      expect(row.field_hlcs.amount).toBe(createOp.hlc) // still has create's HLC
    })
  })
})
