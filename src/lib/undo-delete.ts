export type Resurrectable = 'money' | 'task' | 'learning' | 'note'

/**
 * The single-field update payload for an undo op. Re-asserting one field with a
 * newer HLC both restores that value and triggers op-log.ts applyUpdate's
 * resurrection rule (clears deleted_at), bringing a tombstoned row back.
 */
export function resurrectPayload(
  kind: Resurrectable,
  row: { description?: string | null; title?: string | null; text?: string; body?: string },
): Record<string, unknown> {
  switch (kind) {
    case 'money': return { description: row.description ?? null }
    case 'task': return { title: row.title }
    case 'learning': return { text: row.text }
    case 'note': return { body: row.body }
  }
}
