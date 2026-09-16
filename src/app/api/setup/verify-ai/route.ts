import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { checkAi } from '@/lib/setup'

export const dynamic = 'force-dynamic'

// Step 3 of the wizard: prove the deploy-time GROQ_API_KEY actually works, so a
// new self-hoster never finishes setup believing AI capture/voice/query work
// when the key is missing or invalid. Uses a models-list call (no completion
// tokens). Always responds 200; the body carries the pass/fail + real error.
export async function POST() {
  const { env } = getCloudflareContext()
  const apiKey = (env as { GROQ_API_KEY?: string }).GROQ_API_KEY
  const result = await checkAi(apiKey ? () => makeGroqClient(apiKey).models.list() : null)
  return NextResponse.json(result)
}
