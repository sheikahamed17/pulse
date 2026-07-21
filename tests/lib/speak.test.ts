import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { speak, isVoiceAnswersEnabled, setVoiceAnswersEnabled } from '@/lib/speak'

describe('speak util', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  afterEach(() => { delete (globalThis as { speechSynthesis?: unknown }).speechSynthesis })

  it('defaults to enabled', () => {
    expect(isVoiceAnswersEnabled()).toBe(true)
  })
  it('setVoiceAnswersEnabled(false) persists + disables', () => {
    setVoiceAnswersEnabled(false)
    expect(isVoiceAnswersEnabled()).toBe(false)
    expect(localStorage.getItem('pulse.voiceAnswers')).toBe('off')
  })
  it('speak() no-ops (no throw) when speechSynthesis is absent', () => {
    expect(() => speak('hello')).not.toThrow()
  })
  it('speak() no-ops when toggle is off', () => {
    const speakSpy = vi.fn()
    ;(globalThis as { speechSynthesis?: unknown }).speechSynthesis = { speak: speakSpy, cancel: vi.fn() }
    ;(globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class { constructor(public text: string) {} }
    setVoiceAnswersEnabled(false)
    speak('hello')
    expect(speakSpy).not.toHaveBeenCalled()
  })
  it('speak() cancels prior utterance then speaks when enabled + available', () => {
    const speakSpy = vi.fn(); const cancelSpy = vi.fn()
    ;(globalThis as { speechSynthesis?: unknown }).speechSynthesis = { speak: speakSpy, cancel: cancelSpy }
    ;(globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class { constructor(public text: string) {} }
    speak('hello')
    expect(cancelSpy).toHaveBeenCalled()
    expect(speakSpy).toHaveBeenCalledOnce()
  })
})
