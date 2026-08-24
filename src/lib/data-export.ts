import { OpSchema, type Op } from '@/types/ops'
import type { MoneyEntryRow } from './dexie'

export type Backup = {
  app: 'pulse'
  version: 1
  exported_at: string
  op_count: number
  ops: Op[]
}

export function buildBackup(ops: Op[], exportedAt: string): Backup {
  return {
    app: 'pulse',
    version: 1,
    exported_at: exportedAt,
    op_count: ops.length,
    ops,
  }
}

export function parseBackup(
  text: string
): { ok: true; ops: Op[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not valid JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Backup must be an object' }
  }

  const backup = parsed as Record<string, unknown>

  if (backup.app !== 'pulse') {
    return { ok: false, error: 'app must be "pulse"' }
  }

  if (backup.version !== 1) {
    return { ok: false, error: 'version must be 1' }
  }

  if (!Array.isArray(backup.ops)) {
    return { ok: false, error: 'ops must be an array' }
  }

  const ops = backup.ops as unknown[]
  let invalidCount = 0

  for (const op of ops) {
    const result = OpSchema.safeParse(op)
    if (!result.success) {
      invalidCount++
    }
  }

  if (invalidCount > 0) {
    return {
      ok: false,
      error: `${invalidCount} of ${ops.length} entries are invalid`,
    }
  }

  return { ok: true, ops: ops as Op[] }
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)

  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return '"' + stringValue.replace(/"/g, '""') + '"'
  }

  return stringValue
}

export function moneyEntriesToCsv(rows: MoneyEntryRow[]): string {
  const header = 'date,direction,amount,currency,category_id,merchant,description,tags,account_id'

  const csvRows = rows.map((r) => {
    const amount =
      r.currency === 'JPY'
        ? Math.round(r.amount).toString()
        : (r.amount / 100).toFixed(2)

    const tags = (r.tags ?? []).join('; ')

    const fields = [
      r.occurred_at,
      r.direction,
      amount,
      r.currency,
      r.category_id,
      r.merchant,
      r.description,
      tags,
      r.account_id,
    ]

    return fields.map(escapeCsvField).join(',')
  })

  return [header, ...csvRows].join('\n')
}
