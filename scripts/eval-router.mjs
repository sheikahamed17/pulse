// Live router eval launcher — `pnpm eval:router`.
//
// Loads GROQ_API_KEY from .env.local (without clobbering an already-set env),
// flips ROUTER_EVAL=1, and hands off to vitest so the router-eval suite (which
// is skipped by default) runs against the real gpt-oss-20b. Kept as a plain
// node script so env-setting is cross-platform (no cross-env dependency) and so
// `pnpm test`/CI never touch a live model.
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

if (!process.env.GROQ_API_KEY) {
  console.error('[eval:router] GROQ_API_KEY not found in env or .env.local — the live router eval needs a real key.')
  process.exit(1)
}

process.env.ROUTER_EVAL = '1'

const res = spawnSync('pnpm', ['exec', 'vitest', 'run', 'tests/agents/router-eval.test.ts'], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})
process.exit(res.status ?? 1)
