import type Groq from 'groq-sdk'
import type { DigestMetrics } from '@/lib/digest-aggregate'
import { currencySymbol } from '@/lib/currency'

export function buildDigestSystemPrompt({ weekLabel }: { weekLabel: string }): string {
  return `You are a warm, terse personal financial advisor. Write a 3–4 sentence digest of the week's financial and task activity. Never ask questions. Mention the biggest spending category and task throughput. Keep it human and encouraging.

Week: ${weekLabel}`
}

export function fallbackSummary(metrics: DigestMetrics): string {
  const topCat = metrics.top_categories[0]?.name ?? 'general spending'
  const symbol = currencySymbol(metrics.currency)
  const div = metrics.currency === 'JPY' ? 1 : 100
  return `Your week in review: you spent ${symbol}${(metrics.spend_total / div).toLocaleString()} primarily on ${topCat}, earned ${symbol}${(metrics.income_total / div).toLocaleString()}, and worked through ${metrics.tasks_completed} completed tasks while creating ${metrics.tasks_created} new ones.`
}

export async function writeDigestNarrative({
  client,
  metrics,
  weekLabel,
}: {
  client: Groq
  metrics: DigestMetrics
  weekLabel: string
}): Promise<string> {
  const systemPrompt = buildDigestSystemPrompt({ weekLabel })
  const userMessage = JSON.stringify(metrics)

  const completion = await client.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    temperature: 0.3,
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })

  const text = completion.choices?.[0]?.message?.content ?? ''
  return text.slice(0, 2000)
}
