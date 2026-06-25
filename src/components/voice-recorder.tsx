'use client'

import { useEffect, useRef, useState } from 'react'
import { enqueueVoice } from '@/lib/voice-queue'

type Props = {
  onParsed: (payload: unknown, transcript: string) => void
  disabled?: boolean
}

type RecState = 'idle' | 'recording' | 'uploading' | 'error'

export function VoiceRecorder({ onParsed, disabled }: Props) {
  const [state, setState] = useState<RecState>('idle')
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
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime })
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
    setState('uploading')
    r.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function processBlob(blob: Blob) {
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'voice.webm')
      const res = await fetch('/api/voice', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`voice ${res.status}`)
      const data = await res.json() as { payload: unknown; transcript: string }
      onParsed(data.payload, data.transcript)
      setState('idle')
    } catch (err) {
      console.warn('voice upload failed — queuing', err)
      await enqueueVoice(blob)
      setError('Queued — will retry when online')
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled || state === 'uploading'}
        onClick={state === 'recording' ? stop : start}
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-2xl transition ${
          state === 'recording'
            ? 'border-rose-500 bg-rose-500/20 text-rose-600 animate-pulse'
            : 'border-foreground bg-background hover:bg-accent'
        }`}
        aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
      >
        {state === 'uploading' ? '…' : '🎙️'}
      </button>
      <p className="text-xs text-muted-foreground">
        {state === 'idle'       && 'tap to record'}
        {state === 'recording'  && 'tap again to stop'}
        {state === 'uploading'  && 'transcribing…'}
        {state === 'error'      && (error ?? 'error')}
      </p>
      {error && state === 'idle' && (
        <p className="text-[10px] text-muted-foreground">{error}</p>
      )}
    </div>
  )
}
