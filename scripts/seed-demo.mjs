#!/usr/bin/env node
/**
 * Seed / reset the LIVE demo instance once. The demo Worker's 4-hour reset cron
 * keeps it fresh after this; run this only to seed it immediately after the
 * first deploy. It just POSTs the DEMO_MODE-gated reset endpoint — it never
 * touches production (that endpoint refuses unless DEMO_MODE=true).
 *
 * Usage:
 *   CRON_SECRET=<the demo Worker's CRON_SECRET> \
 *   DEMO_URL=https://pulse-demo.sdsheikahamed.workers.dev \
 *   node scripts/seed-demo.mjs
 */
const url = (process.env.DEMO_URL || 'https://pulse-demo.sdsheikahamed.workers.dev').replace(/\/$/, '')
const secret = process.env.CRON_SECRET

if (!secret) {
  console.error('✘ Set CRON_SECRET to the demo Worker\'s CRON_SECRET secret.')
  process.exit(1)
}

const res = await fetch(`${url}/api/cron/demo-reset`, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
})
const body = await res.text()
console.log(`${res.status} ${body}`)
process.exit(res.ok ? 0 : 1)
