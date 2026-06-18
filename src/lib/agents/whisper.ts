import type Groq from 'groq-sdk'

type Args = {
  client: Groq
  blob: Blob
  filename: string
}

export type WhisperResult = {
  transcript: string
  lang?: string
  duration_ms?: number
}

export async function groqWhisper({ client, blob, filename }: Args): Promise<WhisperResult> {
  const file = blob instanceof File ? blob : new File([blob], filename, { type: blob.type || 'audio/webm' })

  const res = await client.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    response_format: 'verbose_json',
    temperature: 0,
    language: 'en',
  })

  const text = (res as { text?: string }).text?.trim() ?? ''
  if (!text) throw new Error('whisper: empty transcript')

  const lang = (res as { language?: string }).language
  const duration = (res as { duration?: number }).duration
  return {
    transcript: text,
    lang,
    duration_ms: typeof duration === 'number' ? Math.round(duration * 1000) : undefined,
  }
}
