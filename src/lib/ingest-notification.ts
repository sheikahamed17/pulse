import { currencySymbol } from '@/lib/currency'

/** Build the pull-on-push notification for an auto-ingested transaction. */
export function ingestNotification(
  p: { amount: number; currency: string; direction: 'in' | 'out'; description?: string | null; merchant?: string | null },
  entityId: string,
): { title: string; body: string; url: string } {
  const major = (p.amount / (p.currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const symbol = currencySymbol(p.currency)
  const icon = p.direction === 'out' ? '💳' : '💰'
  const sign = p.direction === 'out' ? '' : '+'
  const desc = (p.merchant || p.description) ? ` · ${p.merchant || p.description}` : ''
  return {
    title: `${icon} ${sign}${symbol}${major}${desc}`,
    body: 'Tap to set a category',
    url: `/app?categorize=${entityId}`,
  }
}
