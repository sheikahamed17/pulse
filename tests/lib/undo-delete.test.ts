import { describe, it, expect } from 'vitest'
import { resurrectPayload } from '@/lib/undo-delete'

describe('resurrectPayload', () => {
  it('money re-asserts description, merchant, and tags (null/[] preserved)', () => {
    expect(resurrectPayload('money', { description: 'chai' })).toEqual({ description: 'chai', merchant: null, tags: [] })
    expect(resurrectPayload('money', { description: null })).toEqual({ description: null, merchant: null, tags: [] })
    expect(resurrectPayload('money', { merchant: 'AMAZON', tags: ['subscription'] })).toEqual({ description: null, merchant: 'AMAZON', tags: ['subscription'] })
    expect(resurrectPayload('money', {})).toEqual({ description: null, merchant: null, tags: [] })
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
