import { describe, it, expect, vi } from 'vitest'
import { groqWhisper } from '@/lib/agents/whisper'

describe('groqWhisper', () => {
  it('returns transcript + duration on success', async () => {
    const fakeGroq = {
      audio: { transcriptions: { create: vi.fn().mockResolvedValue({
        text: 'spent 80 on chai',
        language: 'en',
        duration: 1.8,
      }) } },
    }
    const blob = new Blob(['fake audio'], { type: 'audio/webm' })
    const out = await groqWhisper({ client: fakeGroq as never, blob, filename: 'voice.webm' })
    expect(out.transcript).toBe('spent 80 on chai')
    expect(out.lang).toBe('en')
    expect(out.duration_ms).toBe(1800)
  })

  it('throws on empty transcript', async () => {
    const fakeGroq = {
      audio: { transcriptions: { create: vi.fn().mockResolvedValue({ text: '   ' }) } },
    }
    const blob = new Blob(['fake audio'])
    await expect(groqWhisper({ client: fakeGroq as never, blob, filename: 'voice.webm' }))
      .rejects.toThrow(/empty transcript/i)
  })
})
