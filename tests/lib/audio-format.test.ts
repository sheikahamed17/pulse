import { describe, it, expect } from 'vitest'
import { pickAudioMime, filenameForMime } from '@/lib/audio-format'

describe('pickAudioMime', () => {
  it('prefers webm/opus when the browser supports it (desktop Chrome/Firefox)', () => {
    expect(pickAudioMime(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back to audio/mp4 when only mp4 is supported (iOS Safari)', () => {
    const iosSupported = (m: string) => m === 'audio/mp4' || m === 'audio/mp4;codecs=mp4a.40.2'
    // iOS supports mp4 but NOT webm — must not return a webm type
    const picked = pickAudioMime(iosSupported)
    expect(picked.startsWith('audio/mp4')).toBe(true)
    expect(picked).toBe('audio/mp4;codecs=mp4a.40.2')
  })

  it('returns empty string (UA default) when nothing in the list is supported', () => {
    expect(pickAudioMime(() => false)).toBe('')
  })
})

describe('filenameForMime', () => {
  it('maps webm and mp4 to matching extensions so Whisper detects the format', () => {
    expect(filenameForMime('audio/webm;codecs=opus')).toBe('voice.webm')
    expect(filenameForMime('audio/webm')).toBe('voice.webm')
    expect(filenameForMime('audio/mp4')).toBe('voice.mp4') // iOS recording
    expect(filenameForMime('audio/mp4;codecs=mp4a.40.2')).toBe('voice.mp4')
  })

  it('maps aac/m4a variants to .m4a', () => {
    expect(filenameForMime('audio/aac')).toBe('voice.m4a')
    expect(filenameForMime('audio/x-m4a')).toBe('voice.m4a')
  })

  it('falls back to voice.webm for empty/unknown types', () => {
    expect(filenameForMime('')).toBe('voice.webm')
    expect(filenameForMime(undefined)).toBe('voice.webm')
    expect(filenameForMime('application/octet-stream')).toBe('voice.webm')
  })
})
