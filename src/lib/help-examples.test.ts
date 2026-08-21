import { describe, it, expect } from 'vitest'
import { HELP_EXAMPLES } from './help-examples'

describe('HELP_EXAMPLES', () => {
  it('should be non-empty', () => {
    expect(HELP_EXAMPLES.length).toBeGreaterThan(0)
  })

  it('should have every prompt as a non-empty trimmed string', () => {
    HELP_EXAMPLES.forEach((example) => {
      expect(example.prompt).toBeTruthy()
      expect(typeof example.prompt).toBe('string')
      expect(example.prompt.trim().length).toBeGreaterThan(0)
      expect(example.prompt).toBe(example.prompt.trim())
    })
  })

  it('should have every label as a non-empty string', () => {
    HELP_EXAMPLES.forEach((example) => {
      expect(example.label).toBeTruthy()
      expect(typeof example.label).toBe('string')
    })
  })

  it('should have every domain in the allowed set', () => {
    const allowedDomains = new Set(['money', 'task', 'learning', 'note', 'ask'])
    HELP_EXAMPLES.forEach((example) => {
      expect(allowedDomains.has(example.domain)).toBe(true)
    })
  })
})
