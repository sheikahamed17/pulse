/**
 * Run all 3 agent adversarial fixtures against REAL Groq.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_... pnpm exec tsx scripts/eval-agents.ts
 *
 * Optional env vars:
 *   STRICT=1      — exit non-zero on any failure (default: warn but exit 0)
 *   AGENT=money|task|query  — run a single agent (default: all 3)
 *
 * Output per agent: PASS/FAIL line per case + summary + overall rate.
 */
import { makeGroqClient } from '../src/lib/agents/llm-client'
import { parseMoneyEntry } from '../src/lib/agents/money-agent'
import { parseTaskEntry } from '../src/lib/agents/task-agent'
import { parseMoneyQuery } from '../src/lib/agents/query-money-agent'
import { CASES as MONEY_CASES, TEST_CATEGORIES as MONEY_TEST_CATEGORIES } from '../tests/fixtures/money-agent-cases'
import { TASK_CASES, TEST_NOW_ISO as TASK_NOW_ISO, TEST_TZ as TASK_TZ } from '../tests/fixtures/task-agent-cases'
import {
  QUERY_CASES, QUERY_TEST_NOW_ISO, QUERY_TEST_TZ, QUERY_TEST_CATEGORIES,
} from '../tests/fixtures/query-money-cases'

type AgentRunner = () => Promise<{ name: string; passed: number; failed: number; total: number; failures: string[] }>

async function runMoney(client: ReturnType<typeof makeGroqClient>): Promise<{ name: string; passed: number; failed: number; total: number; failures: string[] }> {
  console.log('\n===== money_agent (50 cases) =====')
  let passed = 0, failed = 0
  const failures: string[] = []
  for (const c of MONEY_CASES) {
    try {
      const out = await parseMoneyEntry({
        client,
        text: c.text,
        categories: MONEY_TEST_CATEGORIES,
        nowIso: '2026-06-18T14:30:00.000Z',
      })
      const issues: string[] = []
      for (const [k, v] of Object.entries(c.expect)) {
        // @ts-expect-error indexed
        if (JSON.stringify(out[k]) !== JSON.stringify(v)) issues.push(`${k}: got ${JSON.stringify((out as Record<string, unknown>)[k])}, expected ${JSON.stringify(v)}`)
      }
      if (issues.length === 0) {
        passed++
        console.log(`PASS ${c.id} "${c.text}"`)
      } else {
        failed++
        failures.push(`${c.id}: ${issues.join('; ')}`)
        console.log(`FAIL ${c.id} "${c.text}"`)
        for (const i of issues) console.log(`  - ${i}`)
      }
    } catch (err) {
      failed++
      failures.push(`${c.id}: ${(err as Error).message}`)
      console.log(`ERROR ${c.id} ${(err as Error).message}`)
    }
  }
  return { name: 'money_agent', passed, failed, total: MONEY_CASES.length, failures }
}

async function runTask(client: ReturnType<typeof makeGroqClient>): Promise<{ name: string; passed: number; failed: number; total: number; failures: string[] }> {
  console.log('\n===== task_agent (30 cases) =====')
  let passed = 0, failed = 0
  const failures: string[] = []
  for (const c of TASK_CASES) {
    try {
      const out = await parseTaskEntry({
        client,
        text: c.text,
        nowIso: TASK_NOW_ISO,
        userTz: TASK_TZ,
      })
      const issues: string[] = []
      // due_at is hard to assert exactly (depends on LLM date math); skip it.
      // title + priority are deterministic enough to compare.
      if (c.expect.title !== undefined && out.title !== c.expect.title) {
        issues.push(`title: got ${JSON.stringify(out.title)}, expected ${JSON.stringify(c.expect.title)}`)
      }
      if (c.expect.priority !== undefined && out.priority !== c.expect.priority) {
        issues.push(`priority: got ${JSON.stringify(out.priority)}, expected ${JSON.stringify(c.expect.priority)}`)
      }
      if (c.expect.due_at !== undefined && c.expect.due_at !== out.due_at) {
        // Only assert if the fixture explicitly set it (e.g., null)
        issues.push(`due_at: got ${JSON.stringify(out.due_at)}, expected ${JSON.stringify(c.expect.due_at)}`)
      }
      if (issues.length === 0) {
        passed++
        console.log(`PASS ${c.id} "${c.text}"`)
      } else {
        failed++
        failures.push(`${c.id}: ${issues.join('; ')}`)
        console.log(`FAIL ${c.id} "${c.text}"`)
        for (const i of issues) console.log(`  - ${i}`)
      }
    } catch (err) {
      failed++
      failures.push(`${c.id}: ${(err as Error).message}`)
      console.log(`ERROR ${c.id} ${(err as Error).message}`)
    }
  }
  return { name: 'task_agent', passed, failed, total: TASK_CASES.length, failures }
}

async function runQuery(client: ReturnType<typeof makeGroqClient>): Promise<{ name: string; passed: number; failed: number; total: number; failures: string[] }> {
  console.log('\n===== query_money_agent (20 cases) =====')
  let passed = 0, failed = 0
  const failures: string[] = []
  for (const c of QUERY_CASES) {
    try {
      const out = await parseMoneyQuery({
        client,
        text: c.text,
        categories: QUERY_TEST_CATEGORIES,
        nowIso: QUERY_TEST_NOW_ISO,
        userTz: QUERY_TEST_TZ,
      })
      const issues: string[] = []
      if (c.expect.direction !== undefined && out.direction !== c.expect.direction) {
        issues.push(`direction: got ${out.direction}, expected ${c.expect.direction}`)
      }
      if (c.expect.category_name !== undefined && out.category_name !== c.expect.category_name) {
        issues.push(`category_name: got ${JSON.stringify(out.category_name)}, expected ${JSON.stringify(c.expect.category_name)}`)
      }
      if (c.expect.periodLabel !== undefined && out.period.label !== c.expect.periodLabel) {
        issues.push(`period.label: got "${out.period.label}", expected "${c.expect.periodLabel}"`)
      }
      if (issues.length === 0) {
        passed++
        console.log(`PASS ${c.id} "${c.text}"`)
      } else {
        failed++
        failures.push(`${c.id}: ${issues.join('; ')}`)
        console.log(`FAIL ${c.id} "${c.text}"`)
        for (const i of issues) console.log(`  - ${i}`)
      }
    } catch (err) {
      failed++
      failures.push(`${c.id}: ${(err as Error).message}`)
      console.log(`ERROR ${c.id} ${(err as Error).message}`)
    }
  }
  return { name: 'query_money_agent', passed, failed, total: QUERY_CASES.length, failures }
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('GROQ_API_KEY required. Set it in the environment before running this script.')
    process.exit(1)
  }
  const client = makeGroqClient(apiKey)

  const agentFilter = process.env.AGENT
  const runners: AgentRunner[] = []
  if (!agentFilter || agentFilter === 'money') runners.push(() => runMoney(client))
  if (!agentFilter || agentFilter === 'task')  runners.push(() => runTask(client))
  if (!agentFilter || agentFilter === 'query') runners.push(() => runQuery(client))

  if (runners.length === 0) {
    console.error(`Unknown AGENT="${agentFilter}". Valid: money | task | query`)
    process.exit(1)
  }

  const results: Array<{ name: string; passed: number; failed: number; total: number; failures: string[] }> = []
  for (const run of runners) {
    results.push(await run())
  }

  console.log('\n\n===== Overall Summary =====')
  let allPassed = 0, allTotal = 0
  for (const r of results) {
    const rate = ((r.passed / r.total) * 100).toFixed(1)
    console.log(`${r.name.padEnd(20)} ${r.passed.toString().padStart(3)} / ${r.total} pass (${rate}%)`)
    allPassed += r.passed
    allTotal += r.total
  }
  const overallRate = ((allPassed / allTotal) * 100).toFixed(1)
  console.log(`${'TOTAL'.padEnd(20)} ${allPassed.toString().padStart(3)} / ${allTotal} pass (${overallRate}%)`)

  const hasFailures = results.some(r => r.failed > 0)
  if (hasFailures && process.env.STRICT === '1') {
    console.log('\nSTRICT=1 — exiting non-zero due to failures')
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
