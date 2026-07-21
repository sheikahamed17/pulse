// Shared parser for /api/voice's SSE event stream.
// Used by VoiceRecorder (foreground) and voice-queue drain (background).
// EventSource can't POST a multipart body, so we use fetch + manual SSE parsing.
import { filenameForMime } from '@/lib/audio-format'

export type VoiceStreamEvent =
  | { step: 'transcribing' }
  | { step: 'transcript'; text: string }
  | { step: 'parsing' }
  | { step: 'payload'; intent: string; payload: unknown; transcript?: string }
  | { step: 'error'; message: string }

export type VoiceFinalPayload = {
  intent: string
  payload: unknown
  transcript: string
}

/**
 * Stream the /api/voice response. Calls `onEvent` for each step event as it
 * arrives. Returns the final {intent, payload, transcript} on success, or
 * `null` if the server returned non-200, errored mid-stream, or never sent
 * a payload event.
 */
export async function callVoiceApiStreaming(
  blob: Blob,
  onEvent: (e: VoiceStreamEvent) => void,
  opts: { idleTimeoutMs?: number } = {},
): Promise<VoiceFinalPayload | null> {
  // Abort if the stream goes silent for too long. The server legitimately streams
  // over several seconds (transcribe → route → parse → payload), so this is an
  // INACTIVITY timeout — rearmed on every chunk — not an overall deadline. A hung
  // backend (e.g. a Groq rate-limit stall) then recovers to idle instead of freezing
  // the UI on "Transcribing…". Returning null routes the caller to its offline queue.
  const idleMs = opts.idleTimeoutMs ?? 20000
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), idleMs)
  }

  try {
    const fd = new FormData()
    fd.append('audio', blob, filenameForMime(blob.type))

    arm()
    const res = await fetch('/api/voice', { method: 'POST', body: fd, signal: controller.signal })
    if (!res.ok || !res.body) return null

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let final: VoiceFinalPayload | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      arm() // server is actively streaming — reset the inactivity timer
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
          const event = JSON.parse(data) as VoiceStreamEvent
          onEvent(event)
          if (event.step === 'payload') {
            final = {
              intent: event.intent,
              payload: event.payload,
              transcript: event.transcript ?? '',
            }
          }
        } catch (err) {
          console.warn('voice-sse: failed to parse event', data, err)
        }
      }
    }

    return final
  } catch {
    // network error or inactivity abort — caller enqueues + recovers to idle
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
