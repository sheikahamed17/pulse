import { describe, it, expect } from 'vitest'
import { buildAgentHistory } from './assistant'
import type { AssistantTurn } from './assistant'

describe('buildAgentHistory', () => {
  it('empty input returns empty array', () => {
    expect(buildAgentHistory([])).toEqual([])
  })

  it('mixed user/assistant turns returns only user texts in chronological order', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'first question' },
      { id: '2', role: 'assistant', text: 'first answer' },
      { id: '3', role: 'user', text: 'second question' },
      { id: '4', role: 'assistant', text: 'second answer' },
      { id: '5', role: 'user', text: 'third question' },
    ]
    expect(buildAgentHistory(turns)).toEqual(['first question', 'second question', 'third question'])
  })

  it('respects maxUserMsgs cap, keeping most recent N user messages', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'q1' },
      { id: '2', role: 'user', text: 'q2' },
      { id: '3', role: 'user', text: 'q3' },
      { id: '4', role: 'user', text: 'q4' },
      { id: '5', role: 'user', text: 'q5' },
    ]
    expect(buildAgentHistory(turns, 4)).toEqual(['q2', 'q3', 'q4', 'q5'])
  })

  it('fewer user turns than maxUserMsgs returns all of them', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'q1' },
      { id: '2', role: 'user', text: 'q2' },
    ]
    expect(buildAgentHistory(turns, 4)).toEqual(['q1', 'q2'])
  })

  it('drops empty and whitespace-only user texts', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'valid question' },
      { id: '2', role: 'user', text: '' },
      { id: '3', role: 'user', text: '   \n\t  ' },
      { id: '4', role: 'user', text: 'another valid' },
    ]
    expect(buildAgentHistory(turns)).toEqual(['valid question', 'another valid'])
  })

  it('trims user texts', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: '  padded text  ' },
      { id: '2', role: 'user', text: '\nleading newline' },
    ]
    expect(buildAgentHistory(turns)).toEqual(['padded text', 'leading newline'])
  })

  it('does not mutate input array', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'q1' },
      { id: '2', role: 'assistant', text: 'a1' },
      { id: '3', role: 'user', text: 'q2' },
    ]
    const original = JSON.parse(JSON.stringify(turns))
    buildAgentHistory(turns)
    expect(turns).toEqual(original)
  })

  it('ignores assistant turns completely', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'assistant', text: 'only assistant' },
      { id: '2', role: 'assistant', text: 'no users here' },
    ]
    expect(buildAgentHistory(turns)).toEqual([])
  })

  it('custom maxUserMsgs of 1', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'old' },
      { id: '2', role: 'user', text: 'recent' },
    ]
    expect(buildAgentHistory(turns, 1)).toEqual(['recent'])
  })

  it('custom maxUserMsgs respected with mixed turns', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'q1' },
      { id: '2', role: 'assistant', text: 'a1' },
      { id: '3', role: 'user', text: 'q2' },
      { id: '4', role: 'assistant', text: 'a2' },
      { id: '5', role: 'user', text: 'q3' },
      { id: '6', role: 'assistant', text: 'a3' },
      { id: '7', role: 'user', text: 'q4' },
    ]
    expect(buildAgentHistory(turns, 2)).toEqual(['q3', 'q4'])
  })
})
