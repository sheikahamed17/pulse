import { describe, it, expect, vi, afterEach } from 'vitest'
import { callVoiceApiStreaming } from '@/lib/voice-sse'

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

const blob = () => new Blob(['x'], { type: 'audio/webm' })

afterEach(() => { vi.unstubAllGlobals() })

describe('callVoiceApiStreaming', () => {
  it('parses a normal stream and returns the final payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        'data: {"step":"transcribing"}\n\n',
        'data: {"step":"transcript","text":"hi"}\n\n',
        'data: {"step":"payload","intent":"log_money","payload":{"kind":"money"},"transcript":"hi"}\n\n',
      ]),
    }))
    const steps: string[] = []
    const final = await callVoiceApiStreaming(blob(), e => steps.push(e.step))
    expect(steps).toEqual(['transcribing', 'transcript', 'payload'])
    expect(final).toEqual({ intent: 'log_money', payload: { kind: 'money' }, transcript: 'hi' })
  })

  it('returns null (no freeze) when the server hangs — inactivity abort', async () => {
    // fetch never resolves until its signal aborts (models a hung backend)
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    ))
    const final = await callVoiceApiStreaming(blob(), () => {}, { idleTimeoutMs: 10 })
    expect(final).toBeNull()
  })

  it('returns null on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, body: null }))
    const final = await callVoiceApiStreaming(blob(), () => {})
    expect(final).toBeNull()
  })
})
