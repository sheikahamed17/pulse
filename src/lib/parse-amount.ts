/**
 * Parse a user-typed amount string into MINOR units (× 100), matching the money
 * chip's amount convention. Strips grouping commas. Returns null for
 * empty/invalid/negative input (so the caller can keep the entry un-confirmable).
 */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const v = Number.parseFloat(cleaned)
  if (!Number.isFinite(v) || v < 0) return null
  return Math.round(v * 100)
}
