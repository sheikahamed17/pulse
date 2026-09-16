import { describe, it, expect } from 'vitest'
import { middlewareRedirect, setupStage, isEmailConfigured, magicLinkSentMessage, checkAi } from '@/lib/setup'

describe('middlewareRedirect — first-run gate', () => {
  describe('fresh instance (no user exists)', () => {
    const gated = ['/app', '/analytics', '/dashboard', '/habits', '/journal', '/settings', '/settings/security', '/insights/abc', '/api/sync', '/api/agent', '/']
    for (const pathname of gated) {
      it(`redirects ${pathname} → /setup`, () => {
        expect(middlewareRedirect({ usersExist: false, pathname })).toBe('/setup')
      })
    }

    const allowed = ['/setup', '/setup/anything', '/api/setup/status', '/api/setup/verify-ai', '/api/auth/sign-in/magic-link', '/api/auth/callback/x', '/api/health']
    for (const pathname of allowed) {
      it(`allows ${pathname} (no redirect)`, () => {
        expect(middlewareRedirect({ usersExist: false, pathname })).toBeNull()
      })
    }
  })

  describe('once a user exists', () => {
    it('never forces setup — allows every route', () => {
      for (const pathname of ['/app', '/setup', '/analytics', '/api/sync']) {
        expect(middlewareRedirect({ usersExist: true, pathname })).toBeNull()
      }
    })
  })
})

describe('setupStage — /setup page decision', () => {
  it('no user → create (Welcome + account steps)', () => {
    expect(setupStage({ usersExist: false, authed: false, welcome: false })).toBe('create')
    expect(setupStage({ usersExist: false, authed: false, welcome: true })).toBe('create')
  })

  it('authenticated owner returning from the magic link → continue (Steps 3-5)', () => {
    expect(setupStage({ usersExist: true, authed: true, welcome: true })).toBe('continue')
  })

  it('user exists but stray/completed visit → leave for /app (wizard never reappears)', () => {
    expect(setupStage({ usersExist: true, authed: true, welcome: false })).toBe('app')
    expect(setupStage({ usersExist: true, authed: false, welcome: true })).toBe('app')
    expect(setupStage({ usersExist: true, authed: false, welcome: false })).toBe('app')
  })
})

describe('email configuration + messaging', () => {
  it('isEmailConfigured requires BOTH RESEND_API_KEY and EMAIL_FROM', () => {
    expect(isEmailConfigured({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.co' })).toBe(true)
    expect(isEmailConfigured({ RESEND_API_KEY: 'k' })).toBe(false)
    expect(isEmailConfigured({ EMAIL_FROM: 'a@b.co' })).toBe(false)
    expect(isEmailConfigured({ RESEND_API_KEY: '', EMAIL_FROM: '' })).toBe(false)
    expect(isEmailConfigured({})).toBe(false)
  })

  it('magic-link message points unconfigured users to the deploy logs, not the inbox', () => {
    expect(magicLinkSentMessage(false)).toMatch(/deploy logs/i)
    expect(magicLinkSentMessage(false)).not.toMatch(/check your inbox/i)
    expect(magicLinkSentMessage(true)).toMatch(/inbox/i)
  })
})

describe('checkAi — Step 3 Groq validation', () => {
  it('reports pass when the models list resolves', async () => {
    const result = await checkAi(async () => [{ id: 'openai/gpt-oss-120b' }])
    expect(result).toEqual({ ok: true })
  })

  it('reports fail with the real error when the call rejects (e.g. bad key)', async () => {
    const result = await checkAi(async () => {
      throw new Error('401 Invalid API Key')
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/invalid api key/i)
  })

  it('reports fail with a clear message when no key is configured', async () => {
    const result = await checkAi(null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/GROQ_API_KEY is not set/i)
  })
})
