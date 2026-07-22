import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callGroqJSON, withRetry } from '@/lib/agents/llm-client'

describe('callGroqJSON', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('parses a valid JSON response', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"intent":"log_money","confidence":0.9}' } }],
      }) } },
    }
    const out = await callGroqJSON({
      client: fakeGroq as never,
      model: 'openai/gpt-oss-20b',
      system: 'sys', user: 'usr',
    })
    expect(out).toEqual({ intent: 'log_money', confidence: 0.9 })
  })

  it('throws if the response is not parseable JSON', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }],
      }) } },
    }
    await expect(callGroqJSON({
      client: fakeGroq as never,
      model: 'openai/gpt-oss-20b',
      system: 'sys', user: 'usr',
    })).rejects.toThrow(/parse/i)
  })

  it('throws if the response is empty', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
    }
    await expect(callGroqJSON({
      client: fakeGroq as never,
      model: 'openai/gpt-oss-20b',
      system: 'sys', user: 'usr',
    })).rejects.toThrow(/no choice/i)
  })

  it('uses low reasoning effort + reasoning headroom on top of the output budget', async () => {
    // gpt-oss spends reasoning tokens BEFORE the JSON; those count against max_tokens.
    // A cap sized for the JSON alone (router used 64) truncates mid-reasoning →
    // Groq 400 json_validate_failed "max completion tokens reached".
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] })
    const fakeGroq = { chat: { completions: { create } } }
    await callGroqJSON({ client: fakeGroq as never, model: 'openai/gpt-oss-20b', system: 's', user: 'u', maxTokens: 64 })
    const params = create.mock.calls[0][0]
    expect(params.reasoning_effort).toBe('low')
    // 64 output + 2048 reasoning headroom → well clear of the truncation cliff
    expect(params.max_tokens).toBeGreaterThanOrEqual(2048)
  })
})

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    expect(await withRetry(fn, { attempts: 3, baseMs: 1 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries up to N times then throws the last error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1st'))
      .mockRejectedValueOnce(new Error('2nd'))
      .mockResolvedValue('ok-on-3rd')
    expect(await withRetry(fn, { attempts: 3, baseMs: 1 })).toBe('ok-on-3rd')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable errors', async () => {
    const err = Object.assign(new Error('bad'), { status: 400 })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { attempts: 3, baseMs: 1 })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
