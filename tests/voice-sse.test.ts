import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callVoiceApiStreaming, type VoiceStreamEvent } from '@/lib/voice-sse'

function makeStreamResponse(events: VoiceStreamEvent[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('callVoiceApiStreaming', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('emits all events in order via onEvent callback', async () => {
    const events: VoiceStreamEvent[] = [
      { step: 'transcribing' },
      { step: 'transcript', text: 'spent 80 on chai' },
      { step: 'parsing' },
      { step: 'payload', intent: 'log_money', payload: { kind: 'money', amount: 8000 }, transcript: 'spent 80 on chai' },
    ]
    global.fetch = vi.fn().mockResolvedValue(makeStreamResponse(events))

    const received: VoiceStreamEvent[] = []
    const blob = new Blob(['fake'], { type: 'audio/webm' })
    const out = await callVoiceApiStreaming(blob, e => received.push(e))

    expect(received).toEqual(events)
    expect(out).toEqual({
      intent: 'log_money',
      payload: { kind: 'money', amount: 8000 },
      transcript: 'spent 80 on chai',
    })
  })

  it('returns null when no payload event arrives', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeStreamResponse([
      { step: 'transcribing' },
      { step: 'error', message: 'whisper failed' },
    ]))

    const blob = new Blob(['fake'])
    const out = await callVoiceApiStreaming(blob, () => {})
    expect(out).toBeNull()
  })

  it('returns null on non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('forbidden', { status: 401 }))
    const blob = new Blob(['fake'])
    const out = await callVoiceApiStreaming(blob, () => {})
    expect(out).toBeNull()
  })

  it('handles split-buffer events across reader chunks', async () => {
    // Emit a payload event split across two reader chunks to test the buffer-accumulation logic
    const enc = new TextEncoder()
    const chunks = [
      enc.encode(`data: {"step":"transcribing"}\n\ndata: {"st`),
      enc.encode(`ep":"transcript","text":"x"}\n\ndata: {"step":"payload","intent":"log_money","payload":{"kind":"money","amount":1}}\n\n`),
    ]
    let idx = 0
    const body = new ReadableStream({
      async pull(controller) {
        if (idx < chunks.length) {
          controller.enqueue(chunks[idx++])
        } else {
          controller.close()
        }
      },
    })
    global.fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }))

    const received: VoiceStreamEvent[] = []
    const out = await callVoiceApiStreaming(new Blob(['x']), e => received.push(e))
    expect(received.length).toBe(3)
    expect(received[1]).toEqual({ step: 'transcript', text: 'x' })
    expect(out).not.toBeNull()
  })
})
