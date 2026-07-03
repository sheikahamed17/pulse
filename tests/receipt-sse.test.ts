import { describe, it, expect, vi } from 'vitest'
import { callReceiptApiStreaming, type ReceiptStreamEvent } from '@/lib/receipt-sse'

function makeStreamResponse(events: ReceiptStreamEvent[]): Response {
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

describe('callReceiptApiStreaming', () => {
  it('emits all events in order via onEvent callback', async () => {
    const events: ReceiptStreamEvent[] = [
      { step: 'uploading' },
      { step: 'parsing' },
      { step: 'payload', payload: { kind: 'money', amount: 5000, currency: 'INR', direction: 'out' } },
    ]
    global.fetch = vi.fn().mockResolvedValue(makeStreamResponse(events))

    const received: ReceiptStreamEvent[] = []
    const blob = new Blob(['fake'], { type: 'image/jpeg' })
    const out = await callReceiptApiStreaming(blob, e => received.push(e))

    expect(received).toEqual(events)
    expect(out).toEqual({ payload: { kind: 'money', amount: 5000, currency: 'INR', direction: 'out' } })
  })

  it('returns null when no payload event arrives', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeStreamResponse([
      { step: 'uploading' },
      { step: 'error', message: 'vision failed', receipt_key: 'abc/123.jpg' },
    ]))

    const blob = new Blob(['fake'])
    const out = await callReceiptApiStreaming(blob, () => {})
    expect(out).toBeNull()
  })

  it('returns null on non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('forbidden', { status: 401 }))
    const blob = new Blob(['fake'])
    const out = await callReceiptApiStreaming(blob, () => {})
    expect(out).toBeNull()
  })

  it('includes receipt_key in error event when present', async () => {
    const events: ReceiptStreamEvent[] = [
      { step: 'uploading' },
      { step: 'error', message: 'parse failed', receipt_key: 'user123/uuid.jpg' },
    ]
    global.fetch = vi.fn().mockResolvedValue(makeStreamResponse(events))

    const received: ReceiptStreamEvent[] = []
    await callReceiptApiStreaming(new Blob(['x']), e => received.push(e))
    expect(received[1]).toEqual({ step: 'error', message: 'parse failed', receipt_key: 'user123/uuid.jpg' })
  })
})
