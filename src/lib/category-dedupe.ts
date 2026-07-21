// Deterministic category identity + a pure dedupe planner.
//
// The seed historically minted a fresh random uuid per category on every device
// with an empty local Dexie, so multi-device accounts accumulated N duplicate
// sets (all synced via the op-log). Deterministic ids (`cat-{userId}-{slug}`)
// make seeding idempotent across devices, and `planCategoryDedupe` computes the
// collapse of existing duplicates onto one canonical id per name.

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Stable per (user, category name). All devices produce the same id → no dupes. */
export function categoryId(userId: string, name: string): string {
  return `cat-${userId}-${slugify(name)}`
}

export type DedupeCat = {
  id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  sort_order: number
}

export type DedupePlan = {
  /** Canonical categories that don't yet exist and must be created. */
  canonical: DedupeCat[]
  /** oldCategoryId → canonicalId, for every existing category not already canonical. */
  remap: Record<string, string>
  /** Existing category ids to tombstone (the non-canonical duplicates). */
  tombstones: string[]
}

/**
 * Collapse duplicate categories (by name) onto one canonical id per name.
 * Idempotent: an already-canonical category yields no changes.
 */
export function planCategoryDedupe(cats: DedupeCat[], userId: string): DedupePlan {
  const remap: Record<string, string> = {}
  const tombstones: string[] = []
  const existingIds = new Set(cats.map(c => c.id))
  const canonicalNeeded = new Map<string, DedupeCat>()

  for (const c of cats) {
    const canonId = categoryId(userId, c.name)
    if (c.id === canonId) continue // already canonical — leave it
    remap[c.id] = canonId
    tombstones.push(c.id)
    // Create the canonical only if it doesn't already exist and isn't already queued.
    if (!existingIds.has(canonId) && !canonicalNeeded.has(canonId)) {
      canonicalNeeded.set(canonId, { id: canonId, name: c.name, kind: c.kind, icon: c.icon, sort_order: c.sort_order })
    }
  }

  return { canonical: [...canonicalNeeded.values()], remap, tombstones }
}
