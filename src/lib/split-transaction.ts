// One allocation of a split payment: a category + amount (minor units). A null
// category_id means "Uncategorized" (allowed, like any money entry).
export type Allocation = { category_id: string | null; amount: number }

export function allocatedTotal(allocations: Allocation[]): number {
  return allocations.reduce((n, a) => n + a.amount, 0)
}

/** total − sum(allocations). Positive = under-allocated, negative = over. */
export function splitRemaining(total: number, allocations: Allocation[]): number {
  return total - allocatedTotal(allocations)
}

/**
 * A split is valid when it has at least two parts, every part is a positive
 * amount, and the parts sum EXACTLY to the total (v1 requires exact allocation).
 */
export function isSplitValid(total: number, allocations: Allocation[]): boolean {
  if (allocations.length < 2) return false
  if (allocations.some(a => !(a.amount > 0))) return false
  return allocatedTotal(allocations) === total
}
