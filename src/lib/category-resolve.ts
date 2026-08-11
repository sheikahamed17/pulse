export type CategoryLike = { id: string; name: string; icon: string | null; kind: 'spend' | 'income' }
export type CategoryIdentity = { name: string; icon: string | null; kind: 'spend' | 'income' }

/** Build an id→identity lookup over ALL supplied categories (active, archived, or
 *  tombstoned). Used for DISPLAY name resolution so a leftover/deduped category_id
 *  still shows its real name instead of falling into "Uncategorized". */
export function makeCategoryResolver(cats: CategoryLike[]): (categoryId: string | null) => CategoryIdentity | null {
  const byId = new Map(cats.map(c => [c.id, { name: c.name, icon: c.icon, kind: c.kind }]))
  return (categoryId) => (categoryId ? byId.get(categoryId) ?? null : null)
}
