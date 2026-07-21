'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { callVoiceApiStreaming, type VoiceStreamEvent } from '@/lib/voice-sse'
import { enqueueVoice } from '@/lib/voice-queue'
import { pickAudioMime } from '@/lib/audio-format'

type Props = {
  onParsed: (payload: unknown, transcript: string) => void
  disabled?: boolean
}

type RecState = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'parsing' | 'error'

export function VoiceRecorder({ onParsed, disabled }: Props) {
  const [state, setState] = useState<RecState>('idle')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const streamRef   = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      // Pick a format the device actually supports. iOS Safari records audio/mp4,
      // not webm; an empty pick means "let the UA choose its default".
      const mime = pickAudioMime(m => MediaRecorder.isTypeSupported(m))
      const recorder = new MediaRecorder(stream, mime
        ? { mimeType: mime, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        // Label the blob with the recorder's NEGOTIATED type (the truth), not the
        // requested string — so the upload filename/extension matches the real bytes.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' })
        await processBlob(blob)
      }
      recorder.start()
      recorderRef.current = recorder
      setState('recording')
    } catch (err) {
      setError((err as Error).message || 'mic permission denied')
      setState('error')
    }
  }

  function stop() {
    const r = recorderRef.current
    if (!r || r.state === 'inactive') return
    setState('transcribing')
    r.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function processBlob(blob: Blob) {
    setState('transcribing')
    setTranscript(null)
    setError(null)

    const final = await callVoiceApiStreaming(blob, (event: VoiceStreamEvent) => {
      if (event.step === 'transcribing') setState('transcribing')
      else if (event.step === 'transcript') {
        setTranscript(event.text)
        setState('transcript')
      }
      else if (event.step === 'parsing') setState('parsing')
      else if (event.step === 'error') {
        setError(event.message)
        setState('error')
      }
    })

    if (final) {
      onParsed(final.payload, final.transcript)
      setState('idle')
      setTranscript(null)
    } else {
      console.warn('voice-sse: no final payload, queuing')
      await enqueueVoice(blob)
      setError('Queued — will retry when online')
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <button
          type="button"
          disabled={disabled || state !== 'idle' && state !== 'recording'}
          onClick={state === 'recording' ? stop : start}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] text-[#06111f] shadow-[0_0_24px_rgb(52_230_255/.35)] transition disabled:opacity-50 disabled:pointer-events-none"
          aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
        >
          {state !== 'idle' && state !== 'recording' ? '…' : <Mic className="h-6 w-6" />}
        </button>
        {state === 'recording' && (
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-2)]/50 motion-safe:animate-pulse" />
        )}
      </div>
      <p className={`text-xs ${state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {state === 'idle'         && 'tap to record'}
        {state === 'recording'    && 'tap again to stop'}
        {state === 'transcribing' && 'Transcribing…'}
        {state === 'transcript'   && transcript && `I heard: "${transcript}"`}
        {state === 'parsing'      && 'Understanding…'}
        {state === 'error'        && (error ?? 'error')}
      </p>
      {error && state === 'idle' && (
        <p className="text-[10px] text-muted-foreground">{error}</p>
      )}
    </div>
  )
}
