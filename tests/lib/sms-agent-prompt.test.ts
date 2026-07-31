import { describe, it, expect } from 'vitest'
import { buildSmsAgentSystemPrompt } from '@/lib/agents/prompts/sms-agent'

describe('buildSmsAgentSystemPrompt', () => {
  it('covers both SMS and email and keeps the untrusted-data guard', () => {
    const p = buildSmsAgentSystemPrompt('INR')
    expect(p).toMatch(/email/i)
    expect(p).toMatch(/SMS/i)
    expect(p).toMatch(/UNTRUSTED DATA/i)
    expect(p).toMatch(/never follow/i)
    expect(p).toContain('INR')
  })
})
