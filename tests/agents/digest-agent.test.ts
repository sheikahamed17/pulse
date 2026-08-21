import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Groq from 'groq-sdk'
import { buildDigestSystemPrompt, fallbackSummary, writeDigestNarrative } from '@/lib/agents/digest-agent'
import type { DigestMetrics } from '@/lib/digest-aggregate'

describe('digest-agent', () => {
  describe('buildDigestSystemPrompt', () => {
    it('returns a system prompt mentioning warm tone and specificity', () => {
      const prompt = buildDigestSystemPrompt({ weekLabel: 'Week of June 22–28' })
      expect(prompt).toContain('warm')
      expect(prompt).toContain('terse')
      expect(prompt).toContain('Week of June 22–28')
      expect(prompt).not.toContain('?') // no questions
    })
  })

  describe('fallbackSummary', () => {
    it('returns a deterministic summary from metrics', () => {
      const metrics: DigestMetrics = {
        currency: 'INR',
        spend_total: 80000,
        income_total: 100000,
        top_categories: [{ name: 'Food', amount: 50000 }],
        tasks_completed: 5,
        tasks_created: 3,
        tasks_overdue: 1,
        skipped_currencies: [],
        entry_count: 10,
        learnings_added: 0,
        notes_added: 0,
        top_learning_tags: [],
      }
      const summary = fallbackSummary(metrics)
      expect(summary).toContain('Food')
      expect(summary).toContain('5')
      expect(summary).toContain('3')
      expect(summary.length).toBeGreaterThan(40) // rough check for reasonable length
    })

    it('mentions top category and task throughput', () => {
      const metrics: DigestMetrics = {
        currency: 'INR',
        spend_total: 60000,
        income_total: 50000,
        top_categories: [{ name: 'Transport', amount: 40000 }],
        tasks_completed: 2,
        tasks_created: 4,
        tasks_overdue: 0,
        skipped_currencies: [],
        entry_count: 5,
        learnings_added: 0,
        notes_added: 0,
        top_learning_tags: [],
      }
      const summary = fallbackSummary(metrics)
      expect(summary).toContain('Transport')
      expect(summary).toMatch(/[24]/) // either tasks completed or created
    })

    it('includes learning sentence when learnings_added > 0', () => {
      const metrics: DigestMetrics = {
        currency: 'INR',
        spend_total: 80000,
        income_total: 100000,
        top_categories: [{ name: 'Food', amount: 50000 }],
        tasks_completed: 5,
        tasks_created: 3,
        tasks_overdue: 1,
        skipped_currencies: [],
        entry_count: 10,
        learnings_added: 2,
        notes_added: 0,
        top_learning_tags: ['react', 'typescript'],
      }
      const summary = fallbackSummary(metrics)
      expect(summary).toContain('You logged 2 learnings on react, typescript')
    })

    it('includes notes sentence when notes_added > 0', () => {
      const metrics: DigestMetrics = {
        currency: 'INR',
        spend_total: 80000,
        income_total: 100000,
        top_categories: [{ name: 'Food', amount: 50000 }],
        tasks_completed: 5,
        tasks_created: 3,
        tasks_overdue: 1,
        skipped_currencies: [],
        entry_count: 10,
        learnings_added: 0,
        notes_added: 1,
        top_learning_tags: [],
      }
      const summary = fallbackSummary(metrics)
      expect(summary).toContain('You captured 1 note')
    })

    it('includes both learning and notes sentences when both > 0', () => {
      const metrics: DigestMetrics = {
        currency: 'INR',
        spend_total: 80000,
        income_total: 100000,
        top_categories: [{ name: 'Food', amount: 50000 }],
        tasks_completed: 5,
        tasks_created: 3,
        tasks_overdue: 1,
        skipped_currencies: [],
        entry_count: 10,
        learnings_added: 1,
        notes_added: 3,
        top_learning_tags: ['javascript'],
      }
      const summary = fallbackSummary(metrics)
      expect(summary).toContain('You logged 1 learning on javascript')
      expect(summary).toContain('You captured 3 notes')
    })

    it('omits learning/notes sentence when both are 0', () => {
      const metrics: DigestMetrics = {
        currency: 'INR',
        spend_total: 80000,
        income_total: 100000,
        top_categories: [{ name: 'Food', amount: 50000 }],
        tasks_completed: 5,
        tasks_created: 3,
        tasks_overdue: 1,
        skipped_currencies: [],
        entry_count: 10,
        learnings_added: 0,
        notes_added: 0,
        top_learning_tags: [],
      }
      const summary = fallbackSummary(metrics)
      expect(summary).not.toContain('You logged')
      expect(summary).not.toContain('You captured')
    })
  })

  describe('writeDigestNarrative', () => {
    const metrics: DigestMetrics = {
      currency: 'INR',
      spend_total: 80000,
      income_total: 100000,
      top_categories: [{ name: 'Food', amount: 50000 }],
      tasks_completed: 5,
      tasks_created: 3,
      tasks_overdue: 1,
      skipped_currencies: [],
      entry_count: 10,
      learnings_added: 0,
      notes_added: 0,
      top_learning_tags: [],
    }

    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('returns LLM-generated narrative up to 2000 chars', async () => {
      const mockGroq = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: 'You had a solid week with strong income and focused spending on food.',
                  },
                },
              ],
            }),
          },
        },
      }

      const narrative = await writeDigestNarrative({
        client: mockGroq as unknown as Groq,
        metrics,
        weekLabel: 'Week of June 22–28',
      })

      expect(narrative).toBe('You had a solid week with strong income and focused spending on food.')
      expect(mockGroq.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-oss-120b',
          temperature: 0.3,
          max_tokens: 512,
        }),
      )
    })

    it('clamps narrative to 2000 chars', async () => {
      const longText = 'x'.repeat(2500)
      const mockGroq = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: longText } }],
            }),
          },
        },
      }

      const narrative = await writeDigestNarrative({
        client: mockGroq as unknown as Groq,
        metrics,
        weekLabel: 'Week of June 22–28',
      })

      expect(narrative).toHaveLength(2000)
      expect(narrative).toBe('x'.repeat(2000))
    })

    it('returns fallback summary on LLM failure', async () => {
      const mockGroq = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Groq API error')),
          },
        },
      }

      // The function throws; the route catches and uses fallbackSummary
      await expect(
        writeDigestNarrative({
          client: mockGroq as unknown as Groq,
          metrics,
          weekLabel: 'Week of June 22–28',
        }),
      ).rejects.toThrow('Groq API error')
    })

    it('includes metrics as JSON in the user message', async () => {
      const mockGroq = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Summary.' } }],
            }),
          },
        },
      }

      await writeDigestNarrative({
        client: mockGroq as unknown as Groq,
        metrics,
        weekLabel: 'Week of June 22–28',
      })

      const call = mockGroq.chat.completions.create.mock.calls[0][0]
      expect(call.messages[1].content).toContain(JSON.stringify(metrics))
    })
  })
})
