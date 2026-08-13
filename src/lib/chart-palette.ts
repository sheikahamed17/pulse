/**
 * Chart color palette.
 * Validated against dataviz reference palette with dark surface #1a1a19.
 * Categorical order is CVD-safe; never cycle or reorder.
 */

/** Single-series magnitude (sequential) — app accent cyan */
export const SEQUENTIAL_HUE = 'rgb(52 230 255)'

/** Diverging pair: positive/income, negative/spend, neutral */
export const DIVERGING = {
  positive: '#0ca30c', // success/income
  negative: '#e66767', // spend/critical (red from dark palette)
  neutral: '#383835', // gray midpoint
}

/**
 * Categorical colors (fixed order, CVD-safe adjacent pairs).
 * Used in fixed index order for identity consistency.
 * Reference: dataviz palette.md 2026 eight-slot order.
 */
export const CATEGORICAL = [
  '#3987e5', // 1: blue
  '#d95926', // 2: orange
  '#199e70', // 3: aqua
  '#c98500', // 4: yellow
  '#d55181', // 5: magenta
  '#008300', // 6: green
  '#9085e9', // 7: violet
  '#e66767', // 8: red
]
