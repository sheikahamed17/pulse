import { describe, it, expect } from 'vitest'
import { makeIngestToken, parseIngestToken, hashSecret } from '@/lib/ingest-token'

describe('ingest token', () => {
  it('make → parse round-trips the userId + secret', () => {
    const { token, secret } = makeIngestToken('user-123')
    expect(token.startsWith('pulse_sms_user-123_')).toBe(true)
    const parsed = parseIngestToken(token)
    expect(parsed).toEqual({ userId: 'user-123', secret })
  })

  it('parse rejects malformed tokens', () => {
    expect(parseIngestToken('nope')).toBeNull()
    expect(parseIngestToken('pulse_sms_')).toBeNull()
    expect(parseIngestToken('pulse_sms_useronly')).toBeNull()
  })

  it('handles a userId that contains underscores (splits on the last underscore)', () => {
    const { token, secret } = makeIngestToken('abc_def_ghi')
    expect(parseIngestToken(token)).toEqual({ userId: 'abc_def_ghi', secret })
  })

  it('hashSecret is deterministic hex and differs per input', async () => {
    const a = await hashSecret('s1')
    const b = await hashSecret('s1')
    const c = await hashSecret('s2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
