const SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£',
  AED: 'د.إ', SGD: 'S$', JPY: '¥', AUD: 'A$', CAD: 'C$',
}

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code
}
