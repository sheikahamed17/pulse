import { describe, it, expect } from 'vitest'
import { resurrectPayload } from '@/lib/undo-delete'

describe('resurrectPayload', () => {
  it('money re-asserts description (null preserved)', () => {
    expect(resurrectPayload('money', { description: 'chai' })).toEqual({ description: 'chai' })
    expect(resurrectPayload('money', { description: null })).toEqual({ description: null })
    expect(resurrectPayload('money', {})).toEqual({ description: null })
  })
  it('task re-asserts title', () => {
    expect(resurrectPayload('task', { title: 'Call bank' })).toEqual({ title: 'Call bank' })
  })
  it('learning re-asserts text', () => {
    expect(resurrectPayload('learning', { text: 'TIL' })).toEqual({ text: 'TIL' })
  })
  it('note re-asserts body', () => {
    expect(resurrectPayload('note', { body: 'remember' })).toEqual({ body: 'remember' })
  })
})
