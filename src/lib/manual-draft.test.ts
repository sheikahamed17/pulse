import { describe, it, expect } from 'vitest'
import { manualDraftFromText } from './manual-draft'

const NOW = '2026-08-21T12:00:00Z'
const PRIMARY_CURRENCY = 'INR'

describe('manualDraftFromText', () => {
  describe('money kind', () => {
    it('prefills description with trimmed text', () => {
      const draft = manualDraftFromText('money', '  spent 200 on lunch  ', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'money') throw new Error('expected money')
      expect(draft.description).toBe('spent 200 on lunch')
      expect(draft.raw_input).toBe('spent 200 on lunch')
      expect(draft.amount).toBe(0)
      expect(draft.currency).toBe(PRIMARY_CURRENCY)
      expect(draft.source).toBe('manual')
    })

    it('returns blank description for empty text', () => {
      const draft = manualDraftFromText('money', '  ', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'money') throw new Error('expected money')
      expect(draft.description).toBeNull()
      expect(draft.raw_input).toBeNull()
      expect(draft.amount).toBe(0)
    })
  })

  describe('task kind', () => {
    it('prefills title with trimmed text', () => {
      const draft = manualDraftFromText('task', '  spent 200 on lunch  ', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'task') throw new Error('expected task')
      expect(draft.title).toBe('spent 200 on lunch')
      expect(draft.raw_input).toBe('spent 200 on lunch')
      expect(draft.priority).toBe('medium')
      expect(draft.source).toBe('manual')
    })

    it('returns blank title for empty text', () => {
      const draft = manualDraftFromText('task', '', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'task') throw new Error('expected task')
      expect(draft.title).toBe('')
      expect(draft.raw_input).toBeNull()
    })
  })

  describe('learning kind', () => {
    it('prefills text with trimmed text', () => {
      const draft = manualDraftFromText('learning', '  spent 200 on lunch  ', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'learning') throw new Error('expected learning')
      expect(draft.text).toBe('spent 200 on lunch')
      expect(draft.source).toBe('manual')
    })

    it('returns blank text for empty input', () => {
      const draft = manualDraftFromText('learning', '  ', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'learning') throw new Error('expected learning')
      expect(draft.text).toBe('')
    })
  })

  describe('note kind', () => {
    it('prefills body with trimmed text', () => {
      const draft = manualDraftFromText('note', '  spent 200 on lunch  ', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'note') throw new Error('expected note')
      expect(draft.body).toBe('spent 200 on lunch')
      expect(draft.source).toBe('manual')
    })

    it('returns blank body for empty text', () => {
      const draft = manualDraftFromText('note', '', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'note') throw new Error('expected note')
      expect(draft.body).toBe('')
    })
  })

  describe('common properties', () => {
    it('money uses provided timestamp', () => {
      const draft = manualDraftFromText('money', 'test', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'money') throw new Error('expected money')
      expect(draft.occurred_at).toBe(NOW)
    })

    it('learning uses provided timestamp', () => {
      const draft = manualDraftFromText('learning', 'test', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'learning') throw new Error('expected learning')
      expect(draft.occurred_at).toBe(NOW)
    })

    it('note uses provided timestamp', () => {
      const draft = manualDraftFromText('note', 'test', PRIMARY_CURRENCY, NOW)
      if (draft.kind !== 'note') throw new Error('expected note')
      expect(draft.occurred_at).toBe(NOW)
    })

    it('all kinds preserve source as manual', () => {
      const moneyDraft = manualDraftFromText('money', 'test', PRIMARY_CURRENCY, NOW)
      if (moneyDraft.kind !== 'money') throw new Error('expected money')
      expect(moneyDraft.source).toBe('manual')

      const taskDraft = manualDraftFromText('task', 'test', PRIMARY_CURRENCY, NOW)
      if (taskDraft.kind !== 'task') throw new Error('expected task')
      expect(taskDraft.source).toBe('manual')

      const learningDraft = manualDraftFromText('learning', 'test', PRIMARY_CURRENCY, NOW)
      if (learningDraft.kind !== 'learning') throw new Error('expected learning')
      expect(learningDraft.source).toBe('manual')

      const noteDraft = manualDraftFromText('note', 'test', PRIMARY_CURRENCY, NOW)
      if (noteDraft.kind !== 'note') throw new Error('expected note')
      expect(noteDraft.source).toBe('manual')
    })
  })
})
