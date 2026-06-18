/**
 * Run the money_agent adversarial fixtures against REAL Groq.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_... pnpm exec tsx scripts/eval-agents.ts
 *
 * Output: per-case PASS/FAIL + summary. NOT a test suite — manual eval
 * before merging prompt edits.
 *
 * Set STRICT=1 to exit non-zero on any failure (for CI gates if needed later).
 */
import { makeGroqClient } from '../src/lib/agents/llm-client'
import { parseMoneyEntry } from '../src/lib/agents/money-agent'
import { CASES, TEST_CATEGORIES } from '../tests/fixtures/money-agent-cases'

async function main() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('GROQ_API_KEY required. Set it in the environment before running this script.')
    process.exit(1)
  }
  const client = makeGroqClient(apiKey)

  let passed = 0
  let failed = 0
  const failures: string[] = []

  for (const c of CASES) {
    try {
      const out = await parseMoneyEntry({
        client,
        text: c.text,
        categories: TEST_CATEGORIES,
        nowIso: '2026-06-18T14:30:00.000Z',
      })
      const issues: string[] = []
      for (const [k, v] of Object.entries(c.expect)) {
        // @ts-expect-error indexed
        if (JSON.stringify(out[k]) !== JSON.stringify(v)) {
          // @ts-expect-error indexed
          issues.push(`${k}: got ${JSON.stringify(out[k])}, expected ${JSON.stringify(v)}`)
        }
      }
      if (issues.length === 0) {
        passed++
        console.log(`PASS ${c.id} "${c.text}"`)
      } else {
        failed++
        failures.push(`FAIL ${c.id} "${c.text}"\n  ${issues.join('\n  ')}`)
        console.log(`FAIL ${c.id} "${c.text}"`)
        for (const i of issues) console.log(`  - ${i}`)
      }
    } catch (err) {
      failed++
      failures.push(`ERROR ${c.id} "${c.text}" — ${(err as Error).message}`)
      console.log(`ERROR ${c.id} ${(err as Error).message}`)
    }
  }

  console.log(`\n===== Summary =====`)
  console.log(`PASS: ${passed} / ${CASES.length}`)
  console.log(`FAIL: ${failed}`)
  console.log(`Rate: ${((passed / CASES.length) * 100).toFixed(1)}%`)

  if (failed > 0 && process.env.STRICT === '1') process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
