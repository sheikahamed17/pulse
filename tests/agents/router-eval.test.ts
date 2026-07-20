import { describe, it, expect, beforeAll } from 'vitest'
import Groq from 'groq-sdk'
import { routeIntent } from '@/lib/agents/router'
import { ROUTER_EVAL_CASES } from './router-eval-cases'

/**
 * Opt-in LIVE router eval. Skipped unless ROUTER_EVAL=1 (set by `pnpm eval:router`,
 * which also loads GROQ_API_KEY from .env.local). This keeps `pnpm test` and CI
 * fully offline — no key, no flag → the whole suite is skipped, zero live calls.
 *
 * Run it with:  pnpm eval:router
 *
 * QUOTA NOTE: this hits the real gpt-oss-20b on Groq's free tier, which has a
 * hard daily request/token cap. A 429 is NOT a routing failure, so accuracy is
 * scored only over cases that got a real classification; if too many are
 * rate-limited the run reports INCONCLUSIVE (re-run when quota resets) rather
 * than a misleading low score. Requests are paced sequentially to avoid RPM 429s.
 */
const RUN = process.env.ROUTER_EVAL === '1'

// Accuracy floor over *classified* (non-errored) cases. Diagnostic tripwire for a
// real regression (a whole intent breaking); lenient enough for the handful of
// genuinely-ambiguous collision cases. Provisional until a full clean run pins it.
const ACCURACY_FLOOR = 0.8
// Minimum fraction of the set that must reach the model for the run to be judged.
const MIN_COVERAGE = 0.6
// Stop hammering once the free tier walls us (consecutive rate-limit errors).
const RATE_LIMIT_ABORT = 6
// Sequential pacing — router calls are ~1s, so any concurrency blasts the RPM.
const THROTTLE_MS = 3000

type Result = {
  utterance: string
  expected: string
  acceptable: string[]
  got: string
  ok: boolean
  errored: boolean
  confidence: number
  note?: string
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const isRateLimit = (msg: string) => /rate limit|429/i.test(msg)

describe.skipIf(!RUN)('router live eval [opt-in: pnpm eval:router]', () => {
  const results: Result[] = []
  let aborted = false

  beforeAll(async () => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY missing — run via `pnpm eval:router`')
    const client = new Groq({ apiKey })

    let consecutiveRateLimits = 0
    for (let i = 0; i < ROUTER_EVAL_CASES.length; i++) {
      const c = ROUTER_EVAL_CASES[i]
      const acceptable: string[] = [c.expected, ...(c.acceptable ?? [])]
      let got = 'ERROR'
      let confidence = 0
      let errored = true
      try {
        const r = await routeIntent({ client, text: c.utterance })
        got = r.intent
        confidence = r.confidence
        errored = false
      } catch (err) {
        const msg = (err as Error).message
        got = `ERROR:${msg.slice(0, 40)}`
        consecutiveRateLimits = isRateLimit(msg) ? consecutiveRateLimits + 1 : 0
      }
      if (!errored) consecutiveRateLimits = 0

      results.push({
        utterance: c.utterance,
        expected: c.expected,
        acceptable,
        got,
        ok: !errored && acceptable.includes(got),
        errored,
        confidence,
        note: c.note,
      })

      if (consecutiveRateLimits >= RATE_LIMIT_ABORT) {
        aborted = true
        break // free-tier quota wall — don't waste the rest of the run
      }
      if (i < ROUTER_EVAL_CASES.length - 1) await sleep(THROTTLE_MS)
    }
  }, 420_000)

  it('classifies the eval-set at or above the accuracy floor (over reachable cases)', () => {
    const attempted = results.length
    const classified = results.filter(r => !r.errored)
    const errored = attempted - classified.length
    const correct = classified.filter(r => r.ok).length
    const accuracy = classified.length === 0 ? 0 : correct / classified.length
    const coverage = classified.length / ROUTER_EVAL_CASES.length

    const byIntent = new Map<string, { total: number; ok: number }>()
    for (const r of classified) {
      const b = byIntent.get(r.expected) ?? { total: 0, ok: 0 }
      b.total++
      if (r.ok) b.ok++
      byIntent.set(r.expected, b)
    }

    const lines: string[] = ['', '=== ROUTER LIVE EVAL (openai/gpt-oss-20b, temp 0) ===']
    for (const r of results) {
      const alt = r.acceptable.length > 1 ? ` (or ${r.acceptable.slice(1).join('/')})` : ''
      const mark = r.errored ? 'ERR ' : r.ok ? 'PASS' : 'FAIL'
      lines.push(
        `${mark}  "${r.utterance}"  exp=${r.expected}${alt} got=${r.got} conf=${r.confidence.toFixed(2)}` +
          (r.note ? `\n        · ${r.note}` : ''),
      )
    }
    lines.push('--- per expected intent (classified only) ---')
    for (const [intent, b] of [...byIntent.entries()].sort()) {
      lines.push(`  ${intent.padEnd(15)} ${b.ok}/${b.total}`)
    }
    lines.push(
      `--- classified ${classified.length}/${ROUTER_EVAL_CASES.length}` +
        ` (errored ${errored}${aborted ? ', aborted on rate-limit wall' : ''}) ---`,
    )
    lines.push(`--- ACCURACY: ${correct}/${classified.length} = ${(accuracy * 100).toFixed(1)}%  (floor ${(ACCURACY_FLOOR * 100).toFixed(0)}%) ---`)
    console.log(lines.join('\n'))

    // A rate-limited run is inconclusive, not a routing failure. Fail loudly with
    // guidance rather than reporting a misleading accuracy.
    if (coverage < MIN_COVERAGE) {
      throw new Error(
        `INCONCLUSIVE: only ${classified.length}/${ROUTER_EVAL_CASES.length} cases reached the model ` +
          `(${errored} errored — likely Groq free-tier rate-limit/daily quota). Re-run when quota resets.`,
      )
    }
    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_FLOOR)
  })
})
