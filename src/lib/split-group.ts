// Collapse a flat, ordered list of money entries into display rows: entries
// without a split_group_id stay as single rows; entries that share a
// split_group_id become ONE split row (positioned where the group's first part
// appears, with the parts and their summed total). Pure; input order preserved.

export type MoneyRowGroup<T> =
  | { kind: 'single'; entry: T }
  | { kind: 'split'; groupId: string; parts: T[]; total: number }

export function groupBySplit<T extends { split_group_id?: string | null; amount: number }>(
  entries: T[],
): MoneyRowGroup<T>[] {
  const out: MoneyRowGroup<T>[] = []
  const indexByGroup = new Map<string, number>() // groupId → position in `out`

  for (const entry of entries) {
    const gid = entry.split_group_id
    if (!gid) {
      out.push({ kind: 'single', entry })
      continue
    }
    const existing = indexByGroup.get(gid)
    if (existing === undefined) {
      indexByGroup.set(gid, out.length)
      out.push({ kind: 'split', groupId: gid, parts: [entry], total: entry.amount })
    } else {
      const group = out[existing] as Extract<MoneyRowGroup<T>, { kind: 'split' }>
      group.parts.push(entry)
      group.total += entry.amount
    }
  }

  return out
}
