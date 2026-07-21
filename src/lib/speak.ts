const TOGGLE_KEY = 'pulse.voiceAnswers'

export function isVoiceAnswersEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(TOGGLE_KEY) !== 'off'   // default on
}

export function setVoiceAnswersEnabled(on: boolean): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off')
}

type SpeechCapable = {
  speechSynthesis?: { speak: (u: unknown) => void; cancel: () => void }
  SpeechSynthesisUtterance?: new (text: string) => unknown
}

function synth(): SpeechCapable['speechSynthesis'] | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as SpeechCapable
  if (!g.speechSynthesis || !g.SpeechSynthesisUtterance) return null
  return g.speechSynthesis
}

export function cancelSpeech(): void {
  synth()?.cancel()
}

/** Speak `text` iff the toggle is on and SpeechSynthesis is available. Never throws. */
export function speak(text: string): void {
  try {
    if (!text || !isVoiceAnswersEnabled()) return
    const s = synth()
    if (!s) return
    const Utter = (globalThis as SpeechCapable).SpeechSynthesisUtterance!
    s.cancel()                       // stop any in-flight utterance
    s.speak(new Utter(text))
  } catch {
    /* speech is best-effort; never break the UI */
  }
}
