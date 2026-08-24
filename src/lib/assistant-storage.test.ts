import { describe, it, expect } from 'vitest'
import { capThread, serializeThread, parseThread, THREAD_CAP } from '@/lib/assistant-storage'
import type { AssistantTurn } from '@/lib/assistant'

const turn = (id: string, role: 'user' | 'assistant' = 'user', text = 'hi'): AssistantTurn => ({ id, role, text })

describe('capThread', () => {
  it('keeps all turns when under the cap', () => {
    const t = [turn('1'), turn('2')]
    expect(capThread(t, 5)).toEqual(t)
  })

  it('keeps only the most recent `cap` turns, chronological', () => {
    const t = [turn('1'), turn('2'), turn('3'), turn('4')]
    expect(capThread(t, 2).map(x => x.id)).toEqual(['3', '4'])
  })

  it('does not mutate the input', () => {
    const t = [turn('1'), turn('2'), turn('3')]
    const copy = JSON.parse(JSON.stringify(t))
    capThread(t, 1)
    expect(t).toEqual(copy)
  })

  it('defaults to THREAD_CAP', () => {
    const many = Array.from({ length: THREAD_CAP + 10 }, (_, i) => turn(String(i)))
    expect(capThread(many).length).toBe(THREAD_CAP)
    expect(capThread(many)[0].id).toBe('10')
  })
})

describe('serializeThread / parseThread round-trip', () => {
  it('round-trips a thread with intent + payload', () => {
    const t: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'how much on food?' },
      { id: '2', role: 'assistant', text: '', intent: 'query_money', payload: { kind: 'query_money', mode: 'total' } },
    ]
    expect(parseThread(serializeThread(t))).toEqual(t)
  })

  it('serialize caps to the most recent THREAD_CAP turns', () => {
    const many = Array.from({ length: THREAD_CAP + 5 }, (_, i) => turn(String(i)))
    expect(parseThread(serializeThread(many)).length).toBe(THREAD_CAP)
  })
})

describe('parseThread guards', () => {
  it('returns [] for null/empty/invalid JSON', () => {
    expect(parseThread(null)).toEqual([])
    expect(parseThread('')).toEqual([])
    expect(parseThread('not json')).toEqual([])
  })

  it('returns [] for non-array JSON', () => {
    expect(parseThread('{"a":1}')).toEqual([])
    expect(parseThread('42')).toEqual([])
  })

  it('drops malformed turns (missing id/text/bad role)', () => {
    const raw = JSON.stringify([
      { id: '1', role: 'user', text: 'ok' },
      { id: 2, role: 'user', text: 'bad id' },
      { role: 'user', text: 'no id' },
      { id: '3', role: 'nope', text: 'bad role' },
      { id: '4', role: 'assistant' },
      { id: '5', role: 'assistant', text: 'good' },
    ])
    expect(parseThread(raw).map(t => t.id)).toEqual(['1', '5'])
  })
})
