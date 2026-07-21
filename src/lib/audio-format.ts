// Picking a recordable audio format that BOTH the device and Groq Whisper accept,
// and naming the upload so Whisper detects the format from the extension.
//
// Why this exists: Chrome/Firefox record WebM/Opus, but iOS Safari's MediaRecorder
// only produces audio/mp4 (AAC) — it does NOT support WebM. Hardcoding "voice.webm"
// therefore ships iOS users an mp4 blob mislabeled as WebM, which Whisper can't decode.

// Highest-quality-first; every entry is a container Groq Whisper accepts
// (flac/mp3/mp4/mpeg/mpga/m4a/ogg/wav/webm).
export const MIME_PRIORITY = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
] as const

/**
 * First format from MIME_PRIORITY that `isSupported` accepts, or '' to let the
 * UA choose its own default (MediaRecorder with no mimeType). `isSupported` is
 * injected (MediaRecorder.isTypeSupported) so this stays pure + testable.
 */
export function pickAudioMime(isSupported: (mime: string) => boolean): string {
  for (const mime of MIME_PRIORITY) {
    if (isSupported(mime)) return mime
  }
  return ''
}

/**
 * Upload filename whose extension matches the blob's real container, so Whisper
 * detects the format correctly. Strips any `;codecs=…` suffix first. Unknown
 * types fall back to webm (the desktop-common case).
 */
export function filenameForMime(mime: string | undefined | null): string {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase()
  switch (base) {
    case 'audio/webm': return 'voice.webm'
    case 'audio/mp4':  return 'voice.mp4'
    case 'audio/aac':
    case 'audio/x-m4a':
    case 'audio/m4a':  return 'voice.m4a'
    case 'audio/mpeg': return 'voice.mp3'
    case 'audio/ogg':  return 'voice.ogg'
    case 'audio/wav':
    case 'audio/x-wav': return 'voice.wav'
    default: return 'voice.webm'
  }
}
