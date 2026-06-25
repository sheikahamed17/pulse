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
      model: 'llama-3.1-8b-instant',
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
      model: 'llama-3.1-8b-instant',
      system: 'sys', user: 'usr',
    })).rejects.toThrow(/parse/i)
  })

  it('throws if the response is empty', async () => {
    const fakeGroq = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
    }
    await expect(callGroqJSON({
      client: fakeGroq as never,
      model: 'llama-3.1-8b-instant',
      system: 'sys', user: 'usr',
    })).rejects.toThrow(/no choice/i)
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
