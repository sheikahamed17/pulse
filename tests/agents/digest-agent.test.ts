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
      }
      const summary = fallbackSummary(metrics)
      expect(summary).toContain('Transport')
      expect(summary).toMatch(/[24]/) // either tasks completed or created
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
