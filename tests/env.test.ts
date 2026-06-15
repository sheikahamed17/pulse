import { describe, it, expect } from 'vitest'
import { parseEnv } from '@/lib/env'

describe('env', () => {
  it('rejects missing BETTER_AUTH_SECRET', () => {
    expect(() => parseEnv({})).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('accepts a valid env', () => {
    const env = parseEnv({
      BETTER_AUTH_SECRET: 'a'.repeat(64),
      BETTER_AUTH_URL: 'http://localhost:3000',
      XATA_API_KEY: 'xau_xxx',
      XATA_DATABASE_URL: 'https://example.xata.sh/db/pulse',
      GROQ_API_KEY: 'gsk_xxx',
      NODE_ENV: 'test',
    })
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000')
  })
})
