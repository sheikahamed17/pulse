// Shared parser for /api/receipt's SSE event stream.
// Used by ReceiptButton (foreground) and receipt-queue drain (background).

export type ReceiptStreamEvent =
  | { step: 'uploading' }
  | { step: 'parsing' }
  | { step: 'payload'; payload: unknown }
  | { step: 'error'; message: string; receipt_key?: string }

/**
 * Stream the /api/receipt response. Calls `onEvent` for each step event as it
 * arrives. Returns the final {payload} on success, or `null` if the server
 * returned non-200, errored mid-stream, or never sent a payload event.
 */
export async function callReceiptApiStreaming(
  blob: Blob,
  onEvent: (e: ReceiptStreamEvent) => void,
): Promise<{ payload: unknown } | null> {
  const fd = new FormData()
  fd.append('image', blob, 'receipt.jpg')

  const res = await fetch('/api/receipt', { method: 'POST', body: fd })
  if (!res.ok || !res.body) {
    return null
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let final: { payload: unknown } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })

    // SSE event boundary is \n\n. Process complete events; keep the partial trailing.
    let nl: number
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, nl)
      buf = buf.slice(nl + 2)
      // raw starts with "data: <json>"; strip the prefix
      const data = raw.startsWith('data: ') ? raw.slice(6) : raw
      if (!data.trim()) continue
      try {
        const event = JSON.parse(data) as ReceiptStreamEvent
        onEvent(event)
        if (event.step === 'payload') {
          final = { payload: event.payload }
        }
      } catch (err) {
        console.warn('receipt-sse: failed to parse event', data, err)
      }
    }
  }

  return final
}
